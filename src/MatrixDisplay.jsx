// Original static version
import React from "react";
import Sketch from "react-p5";

const MATRIX_SIZE = 100; // Size of the square matrix

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

const MatrixDisplay = () => {
  const matrix = generateMatrix();

  const setup = (p5, canvasParentRef) => {
    p5.createCanvas(400, 400).parent(canvasParentRef);
    p5.noLoop(); // Render once
  };

  const draw = (p5) => {
    let cellSize = p5.width / MATRIX_SIZE;
    for (let i = 0; i < MATRIX_SIZE; i++) {
      for (let j = 0; j < MATRIX_SIZE; j++) {
        let value = matrix[i][j] * 255; // Map [0,1] to [0,255]
        p5.fill(value);
        p5.noStroke();
        p5.rect(j * cellSize, i * cellSize, cellSize, cellSize);
      }
    }
  };

  return <Sketch setup={setup} draw={draw} />;
};

export default MatrixDisplay;