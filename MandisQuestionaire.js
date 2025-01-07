// Parallel Coordinates
// Copyright (c) 2023, Filip Berendt
// Released under the BSD License: http://opensource.org/licenses/BSD-3-Clause

var width = document.body.clientWidth;
var defaultBackgroundColor = window.getComputedStyle(document.body)['backgroundColor'];
var correctAnswerColor = 'rgb(0, 128, 0)'
var wrongAnswerColor = 'rgb(128, 0, 0)'

var data = readJSONData("data.json");
var instructions = document.getElementById('instructions');
var detailsOnDemand = document.getElementById('details-on-demand');
var kernelAttributes = document.getElementById('kernel-attributes');
var pixelColorPickerContainer = document.getElementById('pixel-palette');
var pixelPickrs = [];

var slider = document.getElementById('slider');
var sliderLock = document.getElementById('slider-lock');
var sliderBounds = [document.getElementById('slider-lower-bound'), document.getElementById('slider-upper-bound')]
var animationEndReachedActionMenu = document.getElementById('animation-limit-action');
var animationFPSInput = document.getElementById('animation-fps');
var animationFrameSkipInput = document.getElementById('animation-frame-skip')
var symbolicFilter = document.getElementById('search');

function readJSONData(filename) {
  return "Poop";
}

function receiveAnswer(correct, choice) {
  boxElement = document.getElementsByClassName("question-answer-box")[choice];
  if(correct) boxElement.style.background = correctAnswerColor;
  else boxElement.style.background = wrongAnswerColor;
}