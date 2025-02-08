import React, { useState, useEffect } from "react";
import Sketch from "react-p5";

const MATRIX_SIZE = 500; // Size of the square matrix
const UPDATE_INTERVAL = 10; // Milliseconds between updates

const generateMatrix = () => {
  let matrix = [];
  for (let i = 0; i < MATRIX_SIZE; i++) {
    matrix[i] = [];
    for (let j = 0; j < MATRIX_SIZE; j++) {
      matrix[i][j] = Math.random(); // Random float [0,1]
    }
  }
  return matrix;
};

const MatrixDisplayDynamic = () => {
  const [matrix, setMatrix] = useState(generateMatrix());
  const [scale, setScale] = useState(1.0); // Scale factor for brightness

  // Refresh the matrix every 100ms
  useEffect(() => {
    const interval = setInterval(() => {
      setMatrix(generateMatrix());
    }, UPDATE_INTERVAL);
    return () => clearInterval(interval);
  }, []);

  const setup = (p5, canvasParentRef) => {
    p5.createCanvas(MATRIX_SIZE, MATRIX_SIZE).parent(canvasParentRef);
  };

  const draw = (p5) => {
    let img = p5.createImage(MATRIX_SIZE, MATRIX_SIZE); // Create off-screen image
    img.loadPixels();
  
    for (let i = 0; i < MATRIX_SIZE; i++) {
      for (let j = 0; j < MATRIX_SIZE; j++) {
        let value = matrix[i][j] * 255 * scale; // Apply brightness
        let index = (i * MATRIX_SIZE + j) * 4; // Pixel array index
        img.pixels[index] = value;      // Red
        img.pixels[index + 1] = value;  // Green
        img.pixels[index + 2] = value;  // Blue
        img.pixels[index + 3] = 255;    // Alpha (fully opaque)
      }
    }
  
    img.updatePixels();
    p5.image(img, 0, 0, p5.width, p5.height); // Draw scaled-up image
  };

  return (
    <div>
      <Sketch setup={setup} draw={draw} />
      <div>
        <label>Brightness Scale: </label>
        <input
          type="range"
          min="0.1"
          max="2.0"
          step="0.1"
          value={scale}
          onChange={(e) => setScale(parseFloat(e.target.value))}
        />
      </div>
    </div>
  );
};

export default MatrixDisplayDynamic;