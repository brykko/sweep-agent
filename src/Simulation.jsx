import React, { useState } from "react";
import Sketch from "react-p5";

const Simulation = () => {
  const [speed, setSpeed] = useState(2); // A user-adjustable parameter

  let x = 50;

  const setup = (p5, canvasParentRef) => {
    p5.createCanvas(400, 200).parent(canvasParentRef);
  };

  const draw = (p5) => {
    p5.background(220);
    x += speed;
    if (x > p5.width) x = 0;
    p5.ellipse(x, 100, 50, 50); // A moving circle
  };

  return (
    <div>
      <Sketch setup={setup} draw={draw} />
      <input
        type="range"
        min="1"
        max="10"
        value={speed}
        onChange={(e) => setSpeed(Number(e.target.value))}
      />
    </div>
  );
};

export default Simulation;