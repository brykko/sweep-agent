import React, { useState, useEffect } from "react";
import Sketch from "react-p5";

const MATRIX_SIZE = 200;  // Grid resolution
const DIR_GRID_SIZE = 60; // Number of possible sweep directions
const NUM_TIMESTEPS = 2000; 
const MAX_WEIGHT = 5;   
const SCALE = 100;        // Scaling factor for position coordinates
const INTERVAL = 100;     // Milliseconds between updates
const AGENT_STEP_SIZE = 5;
const TRACE_FORGETTING_FACTOR = 0.5;

const generatePosGrid = () => {
    const gvpos = Array.from({ length: MATRIX_SIZE }, (_, i) => (i * SCALE) / MATRIX_SIZE);
    console.log("gvpos:", gvpos);
    const xx = gvpos.map(() => [...gvpos]).flat(); // Each row is a copy of gvpos
    const yy = gvpos.map((val) => Array(MATRIX_SIZE).fill(val)).flat(); // Each column is the same value
    return { xx, yy};
};

const generateDirGrid = () => {
    const step = (2 * Math.PI) / DIR_GRID_SIZE;
    return Array.from({ length: DIR_GRID_SIZE }, (_, i) => -Math.PI + i * step);
};

const selectOptimalDirection = (trace, weightsAll, gvdir) => {
    // V2: assumed weightsAll [positions, directions]
    // Compute overlap scores for each direction
    // let overlapScoresAll = gvdir.map((_, j) => 
    //     weightsAll.reduce((sum, weights, i) => sum + weights[j] * trace[i], 0)
    // );
    let overlapScoresAll = weightsAll.map(weights => 
        weights.reduce((sum, w, i) => sum + w * trace[i], 0)
    );

    console.log("overlapScoresAll:", overlapScoresAll.slice(0, 5));
    
    // Find the index of the minimum overlap score
    let iBestScore = overlapScoresAll.indexOf(Math.min(...overlapScoresAll));
    console.log("iBestScore:", iBestScore);

    // Return the best sweep direction
    return gvdir[iBestScore];
};

function calcSweepWeights(agentPos, sweepDirection, sweepKappa, xx, yy) {
    // V2, should work for scalar or row-vector values of sweepDirection
    let dxx = xx.map(x => x - agentPos.x);
    let dyy = yy.map(y => y - agentPos.y);
    let dd = dyy.map((dy, i) => Math.hypot(dy, dxx[i]));

    // console.log("agentPos:", agentPos);
    // console.log("dxx:", dxx.slice(0, 5));
    // console.log("dyy:", dyy.slice(0, 5));
    // console.log("dd:", dd.slice(0, 5));
    
    // Handle both scalar and vector sweepDirection cases
    if (!Array.isArray(sweepDirection)) {
        sweepDirection = [sweepDirection]; // Convert scalar to array for uniformity
    }
    
    let weights = sweepDirection.map(dir => {
        let aa = dyy.map((dy, i) => Math.atan2(dy, dxx[i]));
        // console.log("aa:", aa.slice(0, 5));
        return aa.map((a, i) => Math.exp(sweepKappa * Math.cos(a - dir)) / (dd[i] ** 2));
    });
    
    return weights.map(row => row.map(w => Math.min(w, MAX_WEIGHT))); // Apply max weight limit
};

const AgentSimulation = () => {
    // State variables
    const [trace, setTrace] = useState(
        Array.from({ length: MATRIX_SIZE }, () => Array(MATRIX_SIZE).fill(0)).flat()
    );
    // const [agentPos, setAgentPos] = useState({ x: SCALE*0.1, y: SCALE / 2 });
    const [agentPos, setAgentPos] = useState({ y: SCALE*0.1, x: SCALE*0.1 });
    const [timeStep, setTimeStep] = useState(0);
    const [traceForgettingFactor, setTraceForgettingFactor] = useState(TRACE_FORGETTING_FACTOR);
    const [sweepAngularConcentration, setSweepAngularConcentration] = useState(5);

    // Create the position grid
    const { xx, yy } = generatePosGrid();
    const gvdir = generateDirGrid();

    // Function to update trace based on agent's sweep
    const updateTrace = (prevTrace, newAgentPos) => {
        let newTrace = prevTrace.map(val => val * traceForgettingFactor);

        // Calculate the optimal sweep direction
        const weightsAll = calcSweepWeights(newAgentPos, gvdir, sweepAngularConcentration, xx, yy);
        const sweepDirection = selectOptimalDirection(newTrace, weightsAll, gvdir);

        let weights = calcSweepWeights(newAgentPos, sweepDirection, sweepAngularConcentration, xx, yy);

        // Extract first column (since weights is a [positions x 1] array)
        // weights = weights.map(row => row[0]);
        weights = weights[0];

        // Add the selected sweep to new trace
        newTrace = newTrace.map((val, i) => val + weights[i]);

        // Debugging
        console.log("Sweep direction:", sweepDirection);
        console.log("Trace Matrix (First 10 values):", newTrace.slice(0, 10)); 
        console.log("Sweep Weights (Sample):", weightsAll[0].slice(0, 5)); 

        return newTrace;
      };

    // Simulation update function
    useEffect(() => {
        // if (timeStep >= NUM_TIMESTEPS) return;

        const interval = setInterval(() => {
          // Compute the next agent position FIRST
          const newAgentPos = {
              x: (agentPos.x + AGENT_STEP_SIZE) % SCALE,
              y: (agentPos.y + AGENT_STEP_SIZE) % SCALE,
          };
      
          // Update trace using newPos
          setTrace((prevTrace) => updateTrace(prevTrace, newAgentPos));
      
          // Now update the agent position
          setAgentPos(newAgentPos);
      
          // Update time step
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
        let value = trace[idx] * 50 // Apply brightness
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
    let cellSize = p5.width / SCALE;
    p5.fill(255, 0, 0);
    p5.ellipse(agentPos.x * cellSize, agentPos.y * cellSize, cellSize, cellSize);
  };

  return (
    <div>
      <Sketch setup={(p5, parent) => p5.createCanvas(800, 800).parent(parent)} draw={draw} />
    </div>
  );
};

export default AgentSimulation;
