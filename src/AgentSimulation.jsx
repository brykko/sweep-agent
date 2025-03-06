import React, { useState, useEffect, useRef } from "react";
import Sketch from "react-p5";
import { besseli } from "bessel";

// =============================================================================
// Constants
// =============================================================================
const MATRIX_SIZE = 200;
const DIR_GRID_SIZE = 60;
const SCALE = 100;
const MAX_WEIGHT = 1;

// UI slider ranges
const INTERVAL_RANGE = [100, 1000]; // Milliseconds
const STEP_SIZE_RANGE = [1, 5];     // Pixels
const TRACE_FF_RANGE = [0.5, 1.0];
const SWEEP_KAPPA_RANGE = [0.1, 10.0];

// =============================================================================
// Utility Functions
// =============================================================================

// Generate the position grid (x and y arrays)
const generatePosGrid = () => {
  const positions = Array.from({ length: MATRIX_SIZE }, (_, i) => (i * SCALE) / MATRIX_SIZE);
  const xx = positions.map(() => [...positions]).flat();
  const yy = positions.map(val => Array(MATRIX_SIZE).fill(val)).flat();
  return { xx, yy };
};

// Generate the grid of possible sweep directions (radians)
const generateDirGrid = () => {
  const step = (2 * Math.PI) / DIR_GRID_SIZE;
  return Array.from({ length: DIR_GRID_SIZE }, (_, i) => -Math.PI + i * step);
};

// Choose the optimal sweep direction based on overlap with the trace
const selectOptimalDirection = (trace, weightsAll, directions) => {
  const overlapScores = weightsAll.map(weights =>
    weights.reduce((sum, weight, i) => sum + weight * trace[i], 0)
  );
  const bestIndex = overlapScores.indexOf(Math.min(...overlapScores));
  return directions[bestIndex];
};

// Calculate spatial offsets: distances and angles from the agent position to each grid point.
const calcSpatialOffsets = (agentPos, xx, yy) => {
  const len = xx.length;
  const distances = new Float64Array(len);
  const angles = new Float64Array(len);
  for (let i = 0; i < len; i++) {
    const dx = xx[i] - agentPos.x;
    const dy = yy[i] - agentPos.y;
    distances[i] = Math.hypot(dx, dy);
    angles[i] = Math.atan2(dy, dx);
  }
  return { distances, angles };
};

// Compute sweep weights given spatial offsets and sweep parameters.
// Returns an array (for each direction) of typed arrays containing the weights.
const calcSweepWeights = (offsets, sweepDirection, sweepKappa) => {
  const { distances, angles } = offsets;
  const len = distances.length;

  // Ensure sweepDirection is an array.
  const directions = Array.isArray(sweepDirection) ? sweepDirection : [sweepDirection];
  const numDirs = directions.length;
  const result = new Array(numDirs);
  const normalization = besseli(sweepKappa, 0); // Bessel normalization factor

  for (let d = 0; d < numDirs; d++) {
    const dir = directions[d];
    const weights = new Float64Array(len);
    for (let i = 0; i < len; i++) {
      let weight = Math.exp(sweepKappa * Math.cos(angles[i] - dir)) /
                   (distances[i] * distances[i] * normalization);
      // Cap the weight at MAX_WEIGHT.
      if (weight > MAX_WEIGHT) weight = MAX_WEIGHT;
      weights[i] = weight;
    }
    result[d] = weights;
  }
  return result;
};

// Pure simulation update function.
// It computes the new agent position and updates the trace (after fading) based on the optimal sweep.
const pureSimulationUpdate = (baseState, directions, sweepKappa, xx, yy, stepSize, traceFF) => {
  const { trace, agentPos } = baseState;
  
  // Compute new agent position.
  const newAgentPos = {
    x: (agentPos.x + stepSize) % SCALE,
    y: (agentPos.y + stepSize) % SCALE,
  };

  // Fade the existing trace.
  const fadedTrace = trace.map(val => val * traceFF);

  // Compute spatial offsets, weights for all directions, then choose the optimal direction.
  const offsets = calcSpatialOffsets(newAgentPos, xx, yy);
  const allWeights = calcSweepWeights(offsets, directions, sweepKappa);
  const optimalDir = selectOptimalDirection(fadedTrace, allWeights, directions);
  const weights = calcSweepWeights(offsets, optimalDir, sweepKappa)[0];

  // Update the trace with the new sweep weights.
  const newTrace = fadedTrace.map((val, i) => val + weights[i]);
  return { newTrace, newAgentPos };
};

// =============================================================================
// Pre-computed constant grids (they never change)
// =============================================================================
const { xx, yy } = generatePosGrid();
const gvdir = generateDirGrid();

// =============================================================================
// Main Component: AgentSimulation
// =============================================================================
const AgentSimulation = () => {
  // Simulation settings state.
  const [intervalTime, setIntervalTime] = useState(200);
  const [stepSize, setStepSize] = useState(5);
  const [traceFF, setTraceFF] = useState(0.8);
  const [sweepKappa, setSweepKappa] = useState(5);

  // Simulation state.
  const [trace, setTrace] = useState(Array(MATRIX_SIZE * MATRIX_SIZE).fill(0));
  const [agentPos, setAgentPos] = useState({ x: SCALE * 0.1, y: SCALE * 0.1 });
  const [timeStep, setTimeStep] = useState(0);

  // Ref to hold the "base state" so that simulation updates are idempotent.
  const baseStateRef = useRef(null);

  // Set up the simulation update loop.
  useEffect(() => {
    const interval = setInterval(() => {
      // Initialize base state on first run.
      if (!baseStateRef.current) {
        baseStateRef.current = { trace, agentPos };
      }
      const baseState = baseStateRef.current;
      const { newTrace, newAgentPos } = pureSimulationUpdate(
        baseState,
        gvdir,
        sweepKappa,
        xx,
        yy,
        stepSize,
        traceFF
      );
      baseStateRef.current = { trace: newTrace, agentPos: newAgentPos };
      setTrace(newTrace);
      setAgentPos(newAgentPos);
      setTimeStep(prev => prev + 1);
    }, intervalTime);

    return () => clearInterval(interval);
  }, [intervalTime, sweepKappa, stepSize, traceFF]);

  // p5.js drawing function.
  const draw = (p5) => {
    const img = p5.createImage(MATRIX_SIZE, MATRIX_SIZE);
    img.loadPixels();
    for (let i = 0; i < MATRIX_SIZE; i++) {
      for (let j = 0; j < MATRIX_SIZE; j++) {
        const idx = i * MATRIX_SIZE + j;
        const value = trace[idx] * 255;
        const pixelIndex = idx * 4;
        img.pixels[pixelIndex] = value;
        img.pixels[pixelIndex + 1] = value;
        img.pixels[pixelIndex + 2] = value;
        img.pixels[pixelIndex + 3] = 255;
      }
    }
    img.updatePixels();
    p5.image(img, 0, 0, p5.width, p5.height);

    const cellSize = p5.width / SCALE;
    p5.fill(255, 0, 0);
    p5.ellipse(agentPos.x * cellSize, agentPos.y * cellSize, cellSize, cellSize);
  };

  return (
    <div>
      {/* UI Controls */}
      <div style={{ marginBottom: "20px" }}>
        <label>
          <strong>Update Interval: {intervalTime}ms</strong>
          <input
            type="range"
            min={INTERVAL_RANGE[0]}
            max={INTERVAL_RANGE[1]}
            value={intervalTime}
            onChange={(e) => setIntervalTime(Number(e.target.value))}
          />
        </label>
        <br />
        <label>
          <strong>Agent Step Size: {stepSize}px</strong>
          <input
            type="range"
            min={STEP_SIZE_RANGE[0]}
            max={STEP_SIZE_RANGE[1]}
            value={stepSize}
            onChange={(e) => setStepSize(Number(e.target.value))}
          />
        </label>
        <br />
        <label>
          <strong>Trace Forgetting Factor: {traceFF}</strong>
          <input
            type="range"
            min={TRACE_FF_RANGE[0]}
            max={TRACE_FF_RANGE[1]}
            step={0.01}
            value={traceFF}
            onChange={(e) => setTraceFF(Number(e.target.value))}
          />
        </label>
        <br />
        <label>
          <strong>Sweep Angular Concentration: {sweepKappa}</strong>
          <input
            type="range"
            min={SWEEP_KAPPA_RANGE[0]}
            max={SWEEP_KAPPA_RANGE[1]}
            step={0.1}
            value={sweepKappa}
            onChange={(e) => setSweepKappa(Number(e.target.value))}
          />
        </label>
      </div>

      <Sketch setup={(p5, parent) => p5.createCanvas(800, 800).parent(parent)} draw={draw} />
    </div>
  );
};

export default AgentSimulation;