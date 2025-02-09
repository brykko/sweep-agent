import React, { useState, useEffect } from "react";
import Sketch from "react-p5";

const MATRIX_SIZE = 100;  // Grid resolution
const DIR_GRID_SIZE = 60; // Number of possible sweep directions
const NUM_TIMESTEPS = 20; 
const MAX_WEIGHT = 100;   
const SCALE = 100;        // Scaling factor for position coordinates
const INTERVAL = 100;     // Milliseconds between updates

const generatePosGrid = () => {
    const gvpos = Array.from({ length: MATRIX_SIZE }, (_, i) => (i * SCALE) / MATRIX_SIZE);
    const xx = gvpos.map(() => [...gvpos]).flat(); // Each row is a copy of gvpos
    const yy = gvpos.map((val) => Array(MATRIX_SIZE).fill(val)).flat(); // Each column is the same value
    return { xx, yy};
};

const generateDirGrid = () => {
    const step = (2 * Math.PI) / DIR_GRID_SIZE;
    return Array.from({ length: DIR_GRID_SIZE }, (_, i) => -Math.PI + i * step);
};

// const selectOptimalDirection = (trace, weightsAll, gvdir) => {
//     // V1: assumed weightsAll [directions, positions]
//     // Compute overlap scores for each direction
//     let overlapScoresAll = weightsAll.map(weights => 
//         weights.reduce((sum, w, i) => sum + w * trace[i], 0)
//     );
    
//     // Find the index of the minimum overlap score
//     let iBestScore = overlapScoresAll.indexOf(Math.min(...overlapScoresAll));
    
//     // Return the best sweep direction
//     return gvdir[iBestScore];
// };

const selectOptimalDirection = (trace, weightsAll, gvdir) => {
    // V2: assumed weightsAll [positions, directions]
    // Compute overlap scores for each direction
    let overlapScoresAll = gvdir.map((_, j) => 
        weightsAll.reduce((sum, weights, i) => sum + weights[j] * trace[i], 0)
    );
    
    // Find the index of the minimum overlap score
    let iBestScore = overlapScoresAll.indexOf(Math.min(...overlapScoresAll));
    
    // Return the best sweep direction
    return gvdir[iBestScore];
};

// function calcSweepWeights(agentPos, sweepDirection, sweepKappa, xx, yy) {
//     // V1, only supports scalar values for sweepDirection
//     let dxx = xx.map(x => x - agentPos[0]);
//     let dyy = yy.map(y => y - agentPos[1]);
//     let aa = dyy.map((dy, i) => Math.atan2(dy, dxx[i]));
//     let dd = dyy.map((dy, i) => Math.hypot(dy, dxx[i]));
//     let weights = aa.map((a, i) => Math.exp(sweepKappa * Math.cos(a - sweepDirection)) / (dd[i] ** 2));
//     return weights.map(w => Math.min(w, MAX_WEIGHT));
// }

function calcSweepWeights(agentPos, sweepDirection, sweepKappa, xx, yy) {
    // V2, should work for scalar or row-vector values of sweepDirection
    let dxx = xx.map(x => x - agentPos[0]);
    let dyy = yy.map(y => y - agentPos[1]);
    let dd = dyy.map((dy, i) => Math.hypot(dy, dxx[i]));
    
    // Handle both scalar and vector sweepDirection cases
    if (!Array.isArray(sweepDirection)) {
        sweepDirection = [sweepDirection]; // Convert scalar to array for uniformity
    }
    
    let weights = sweepDirection.map(dir => {
        let aa = dyy.map((dy, i) => Math.atan2(dy, dxx[i]));
        return aa.map((a, i) => Math.exp(sweepKappa * Math.cos(a - dir)) / (dd[i] ** 2));
    });
    
    return weights.map(row => row.map(w => Math.min(w, MAX_WEIGHT))); // Apply max weight limit
};

const AgentSimulation = () => {
    // State variables
    const [trace, setTrace] = useState(
        Array.from({ length: MATRIX_SIZE }, () => Array(MATRIX_SIZE).fill(0)).flat()
    );
    const [agentPos, setAgentPos] = useState({ x: 10, y: MATRIX_SIZE / 2 });
    const [timeStep, setTimeStep] = useState(0);
    const [traceForgettingFactor, setTraceForgettingFactor] = useState(1.0);
    const [sweepAngularConcentration, setSweepAngularConcentration] = useState(5);

    // Create the position grid
    const { xx, yy } = generatePosGrid();
    const gvdir = generateDirGrid();

    // Function to update trace based on agent's sweep
    const updateTrace = (prevTrace) => {
        let newTrace = prevTrace.map(val => val * traceForgettingFactor);

        // Calculate the optimal sweep direction
        const weightsAll = calcSweepWeights(agentPos, gvdir, sweepAngularConcentration, xx, yy);
        const sweepDirection = selectOptimalDirection(trace, weightsAll, gvdir);

        const weights = calcSweepWeights(agentPos, sweepDirection, sweepAngularConcentration, xx, yy);
        // Add the selected sweep to trace
        // newTrace += weights;
        newTrace = newTrace.map((val, i) => val + weights[i]);
        return newTrace;
      };

    // Simulation update function
    useEffect(() => {
        if (timeStep >= NUM_TIMESTEPS) return;

        const interval = setInterval(() => {
            setTrace((prevTrace) => updateTrace(prevTrace));
            setAgentPos((prevPos) => ({ x: prevPos.x + 1, y: prevPos.y }));
            setTimeStep((prevTime) => prevTime + 1);
        }, INTERVAL);

        return () => clearInterval(interval);
    }, [timeStep]);


  const draw = (p5) => {
    let img = p5.createImage(MATRIX_SIZE, MATRIX_SIZE); // Create off-screen image
    img.loadPixels();
  
    for (let i = 0; i < MATRIX_SIZE; i++) {
      for (let j = 0; j < MATRIX_SIZE; j++) {
        let idx = i * MATRIX_SIZE + j;
        let value = trace[idx] * 255; // Apply brightness
        let idx4 = (i * MATRIX_SIZE + j) * 4; // Pixel array index
        img.pixels[idx4] = value;      // Red
        img.pixels[idx4 + 1] = value;  // Green
        img.pixels[idx4 + 2] = value;  // Blue
        img.pixels[idx4 + 3] = 255;    // Alpha (fully opaque)
      }
    }
  
    img.updatePixels();
    p5.image(img, 0, 0, p5.width, p5.height); // Draw scaled-up image

    // Draw agent
    let cellSize = p5.width / MATRIX_SIZE;
    p5.fill(255, 0, 0);
    p5.ellipse(agentPos.x * cellSize, agentPos.y * cellSize, cellSize, cellSize);
  };

  return (
    <div>
      <Sketch setup={(p5, parent) => p5.createCanvas(400, 400).parent(parent)} draw={draw} />
    </div>
  );
};

export default AgentSimulation;
