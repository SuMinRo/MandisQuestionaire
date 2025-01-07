// Parallel Coordinates
// Copyright (c) 2023, Filip Berendt
// Released under the BSD License: http://opensource.org/licenses/BSD-3-Clause

const colorBrewerPalette = [[166, 206, 227],
                            [31, 120, 180],
                            [178, 223, 138],
                            [51, 160, 44],
                            [251, 154, 153],
                            [227, 26, 28],
                            [253, 191, 111],
                            [255, 127, 0],
                            [202, 178, 214],
                            [106, 61, 154],
                            [255, 255, 153],
                            [177, 89, 40]]

var width = document.body.clientWidth,
    height = d3.max([document.body.clientHeight-540, 240]);

var m = [60, 0, 10, 0],
    w = width - m[1] - m[3],
    h = height - m[0] - m[2],
    xscale = d3.scale.ordinal().rangePoints([0, w], 1),
    yscale = {},
    dragging = {},
    line = d3.svg.line(),
    axis = d3.svg.axis().orient("left").ticks(1+height/50),
    data,
    kernelImageData,
    kernelImageResolution,
    foreground,
    background,
    highlighted,
    alwaysHighlight,
    kernelImage,
    kernelReference,
    dimensions,
    render_speed = 100,
    brush_count = 0,
    excluded_groups = [],
    symbolicFilterQuery = "",
    colorBounds = [],
    kernelPixelValueBounds = [],
    timestepBounds = [],
    showTimestepBounds = [],
    attrDict = {},
    colorDim,
    normaliseColorMappingVar,
    colorPalette = [[0, 0, 255],[255, 255, 255],[255, 0, 0]],
    kernelPixelColorPalette = [[0, 0, 255],[255, 255, 255],[255, 0, 0]],
    animateSliderHandle,
    animateSliderActive = false,
    animationDir = 0;
    animationEndReachedAction = 0; //0 = Stop, 1 = Loop, 2 = Reverse
    animationFPS = 1
    animationFrameSkip = 0,
    animationFrameSkipOverstep = 0; 

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

var colorPickerContainer = document.getElementById('color-palette');
var colorAmount = document.getElementById('color-amount');
var dataPickrs = [];
const colorPickerConfig = {
  swatches: null,

  defaultRepresentation: 'HEXA',
  components: {
      opacity: false,
      hue: true,

      interaction: {
        hex: true,
        rgba: true,
        hsla: true,
        hsva: true,
        cmyk: true,
        input: true,
        clear: false,
        save: false
    }
  }
};

// Scale chart and canvas height
d3.select("#chart")
    .style("height", (h + m[0] + m[2]) + "px")

d3.selectAll("canvas")
    .attr("width", w)
    .attr("height", h)
    .style("padding", m.join("px ") + "px");

// Undo changes to kernel image and kernel reference canvas
d3.select("#kernel-image")
    .attr('width', 200)
    .attr('height', 200)
    .style('padding', null)
    .style('border', "1px solid white");

d3.select("#kernel-reference")
    .attr('width', 200)
    .attr('height', 20)
    .style('padding', null)
    .style('border', "1px solid white");

// Foreground canvas for primary view
foreground = document.getElementById('foreground').getContext('2d');
foreground.globalCompositeOperation = "destination-over";
foreground.strokeStyle = "rgba(0,100,160,0.1)";
foreground.lineWidth = 1.7;
foreground.fillText("Loading...",w/2,h/2);

// Highlight canvas for temporary interactions
highlighted = document.getElementById('highlight').getContext('2d');
highlighted.strokeStyle = "rgba(0,100,160,1)";
highlighted.lineWidth = 4;

// Background canvas
background = document.getElementById('background').getContext('2d');
background.strokeStyle = "rgba(0,100,160,0.1)";
background.lineWidth = 1.7;

// Kernel image canvas
kernelImage = document.getElementById('kernel-image').getContext('2d');
// Kernel color reference canvas
kernelReference = document.getElementById('kernel-reference').getContext('2d');

// SVG for ticks, labels, and interactions
var svg = d3.select("svg")
    .attr("width", w + m[1] + m[3])
    .attr("height", h + m[0] + m[2])
  .append("svg:g")
    .attr("transform", "translate(" + m[3] + "," + m[0] + ")");

// Load the data and visualization
d3.tsv("RawData\\realkernels.tsv", function(raw_data) {
  // Convert quantitative scales to floats
  data = raw_data.map(function(d) {
    for (var k in d) {
      if (!_.isNaN(raw_data[0][k] - 0)) {
        d[k] = parseFloat(d[k]) || 0;
      }
    };
    return d;
  });

  // Set timestep bound for time slider.
  timestepBounds = d3.extent(data.map(x => x.timestep));

  // Initialise time slider and its values to the filter.
  noUiSlider.create(slider, {
    start: [0, 1],
    connect: true,
    range: {
        'min': timestepBounds[0],
        'max': timestepBounds[1] + 1
    },
    step: 1,
    margin: 1,
    behaviour: "drag-fixed"
  });
  showTimestepBounds = slider.noUiSlider.get();

  // Creates Color Palette elements
  for (const color of colorPalette) {
    const el = document.createElement('p');
    colorPickerContainer.appendChild(el);
    const pickr = new Pickr(Object.assign({
      el, theme: 'monolith',
      default: ["#", color[0].toString(16).padStart(2, '0'), color[1].toString(16).padStart(2, '0'), color[2].toString(16).padStart(2, '0')].join(""),
      comparison: false
    }, colorPickerConfig));
    pickr.on('change', changeColorForData);
    dataPickrs.push(pickr);
  }
  for (const color of kernelPixelColorPalette) {
    const el = document.createElement('p');
    pixelColorPickerContainer.appendChild(el);
    const pickr = new Pickr(Object.assign({
      el, theme: 'monolith',
      default: ["#", color[0].toString(16).padStart(2, '0'), color[1].toString(16).padStart(2, '0'), color[2].toString(16).padStart(2, '0')].join(""),
      comparison: false
    }, colorPickerConfig));
    pickr.on('change', changeColorForPixels);
    pixelPickrs.push(pickr);
  }

  // Extract the list of numerical dimensions and create a scale for each.
  xscale.domain(dimensions = d3.keys(data[0]).filter(function(k) {
    return (_.isNumber(data[0][k])) && (yscale[k] = d3.scale.linear()
      .domain(d3.extent(data, function(d) { return +d[k]; }))
      .range([h, 0]));
  }));

  // Default to not normalise color mapping.
  normaliseColorMappingVar = false;
  // Selectes default dimension to color scale.
  colorDim = "Activity";
  // Set evaluation bounds for color mapping.
  colorBounds = d3.extent(data.map(x => x[colorDim]));
  // Fills dimension dropdown menu with dimensions.
  var dimSelect = document.getElementById("colorDimensions");
  for (const dim of dimensions) {
    var option = document.createElement("option");
    option.setAttribute("value", dim);
    option.appendChild(document.createTextNode(dim));
    dimSelect.appendChild(option);
  }
  dimSelect.value = colorDim;

  // Fills dictionary up with dimension names, with lowercase as keys.
  for (const dimension of dimensions)  attrDict[dimension.toLowerCase()] = dimension;

  // Add a group element for each dimension.
  var g = svg.selectAll(".dimension")
      .data(dimensions)
    .enter().append("svg:g")
      .attr("class", "dimension")
      .attr("transform", function(d) { return "translate(" + xscale(d) + ")"; })
      .call(d3.behavior.drag()
        .on("dragstart", function(d) {
          dragging[d] = this.__origin__ = xscale(d);
          this.__dragged__ = false;
          d3.select("#foreground").style("opacity", "0.35");
        })
        .on("drag", function(d) {
          dragging[d] = Math.min(w, Math.max(0, this.__origin__ += d3.event.dx));
          dimensions.sort(function(a, b) { return position(a) - position(b); });
          xscale.domain(dimensions);
          g.attr("transform", function(d) { return "translate(" + position(d) + ")"; });
          brush_count++;
          this.__dragged__ = true;

          // Feedback for axis deletion if dropped
          if (dragging[d] < 12 || dragging[d] > w-12) {
            d3.select(this).select(".background").style("fill", "#b00");
          } else {
            d3.select(this).select(".background").style("fill", null);
          }
        })
        .on("dragend", function(d) {
          if (!this.__dragged__) {
            // no movement, invert axis
            var extent = invert_axis(d);

          } else {
            // reorder axes
            d3.select(this).transition().attr("transform", "translate(" + xscale(d) + ")");

            var extent = yscale[d].brush.extent();
          }

          // remove axis if dragged all the way left
          if (dragging[d] < 12 || dragging[d] > w-12) {
            remove_axis(d,g);
          }

          // TODO required to avoid a bug
          xscale.domain(dimensions);
          update_ticks(d, extent);

          // rerender
          d3.select("#foreground").style("opacity", null);
          brush();
          delete this.__dragged__;
          delete this.__origin__;
          delete dragging[d];
        }))

  // Add an axis and title.
  g.append("svg:g")
      .attr("class", "axis")
      .attr("transform", "translate(0,0)")
      .each(function(d) { d3.select(this).call(axis.scale(yscale[d])); })
    .append("svg:text")
      .attr("text-anchor", "middle")
      .attr("y", -20)
      .attr("x", 0)
      .attr("class", "label")
      .text(String)
      .append("title")
        .text("Click to invert. Drag to reorder");

  // Add and store a brush for each axis.
  g.append("svg:g")
      .attr("class", "brush")
      .each(function(d) { d3.select(this).call(yscale[d].brush = d3.svg.brush().y(yscale[d]).on("brush", brush)); })
    .selectAll("rect")
      .style("visibility", null)
      .attr("x", -8)
      .attr("width", 17)
      .append("title")
        .text("Drag up or down to brush along this axis");

  g.selectAll(".extent")
      .append("title")
        .text("Drag or resize this filter");

  // Render full foreground
  brush();

  slider.noUiSlider.on('update', function () {
    showTimestepBounds = slider.noUiSlider.get();
    sliderBounds[0].value = parseInt(showTimestepBounds[0]);
    sliderBounds[1].value = parseInt(showTimestepBounds[1]); 
    brush();
  });

  sliderLock.onclick = function () {
    var options = slider.noUiSlider.options;
    slider.noUiSlider.destroy();
    options.start = showTimestepBounds;
    
    if (sliderLock.checked) {
      options.behaviour = 'drag-fixed';
    }
    else {
      options.behaviour = 'none';
    }

    noUiSlider.create(slider, options);
    slider.noUiSlider.on('update', function () {
      showTimestepBounds = slider.noUiSlider.get();
      sliderBounds[0].value = parseInt(showTimestepBounds[0]);
      sliderBounds[1].value = parseInt(showTimestepBounds[1]); 
      brush();
    });
  };

  sliderBounds[0].onkeydown = function () {
    if (animateSliderActive) {}
    else if (event.key === "Enter") {this.select()}
    else return;

    var newLowerBound = parseInt(sliderBounds[0].value);
    var upperBound = parseInt(slider.noUiSlider.get()[1]);
    if (animateSliderActive) {
      newLowerBound += animationDir * (1 + animationFrameSkip);
      if (newLowerBound < timestepBounds[0]) {
        animationFrameSkipOverstep = timestepBounds[0] - newLowerBound;
      }
      slider.noUiSlider.set([newLowerBound, upperBound]);
    }
    else {
      if (!isNaN(newLowerBound) && newLowerBound < upperBound && newLowerBound >= slider.noUiSlider.options.range.min) {
        slider.noUiSlider.set([newLowerBound, upperBound]);
      }
      else sliderBounds[0].value = parseInt(slider.noUiSlider.get()[0]);
    }
  };

  sliderBounds[0].onblur = function () {
    var newLowerBound = parseInt(sliderBounds[0].value);
    var upperBound = parseInt(slider.noUiSlider.get()[1]);
    if (!isNaN(newLowerBound) && newLowerBound < upperBound && newLowerBound >= slider.noUiSlider.options.range.min) {
      slider.noUiSlider.set([newLowerBound, upperBound]);
    }
    else sliderBounds[0].value = parseInt(slider.noUiSlider.get()[0]);
  };

  sliderBounds[1].onkeydown = function () {
    if (animateSliderActive) {}
    else if (event.key === "Enter") {this.select()}
    else return;
    
    var newUpperBound = parseInt(sliderBounds[1].value);
    var lowerBound = parseInt(slider.noUiSlider.get()[0]);
    if (animateSliderActive) {
      newUpperBound += animationDir * (1 + animationFrameSkip);
      if (newUpperBound > timestepBounds[1] + 1) {
        animationFrameSkipOverstep = newUpperBound - timestepBounds[1] - 1;
      }
      slider.noUiSlider.set([lowerBound, newUpperBound]);
    }
    else {
      if (!isNaN(newUpperBound) && newUpperBound > lowerBound && newUpperBound <= slider.noUiSlider.options.range.max) {
        slider.noUiSlider.set([lowerBound, newUpperBound]);
      }
      else sliderBounds[1].value = parseInt(slider.noUiSlider.get()[1]);
    }
  };

  sliderBounds[1].onblur = function () {
    var newUpperBound = parseInt(sliderBounds[1].value);
    var lowerBound = parseInt(slider.noUiSlider.get()[0]);
    if (!isNaN(newUpperBound) && newUpperBound > lowerBound && newUpperBound <= slider.noUiSlider.options.range.max) {
      slider.noUiSlider.set([lowerBound, newUpperBound]);
    }
    else sliderBounds[1].value = parseInt(slider.noUiSlider.get()[1]);
  };

  animationFPSInput.onkeydown = function () {
    if (event.key === "Enter") {}
    else return;

    var input = parseFloat(animationFPSInput.value);
    if(!isNaN(input)) {
      animationFPS = input;
      if(animateSliderActive) animateSliderReset();
    }
    else animationFPSInput.value = animationFPS;
    this.select();
  };

  animationFPSInput.onblur = function () {
    var input = parseFloat(animationFPSInput.value);
    if(!isNaN(input)) {
      animationFPS = input;
      if(animateSliderActive) animateSliderReset();
    }
    else animationFPSInput.value = animationFPS;
  }

  animationFrameSkipInput.onkeydown = function () {
    if (event.key === "Enter") {}
    else return;

    var input = parseInput(animationFrameSkipInput.value);
    if(!isNaN(input)) {
      animationFrameSkip = input;
    }
    else animationFrameSkipInput.value = animationFrameSkip;
    this.select();
  };

  animationFrameSkipInput.onblur = function () {
    var input = parseFloat(animationFrameSkipInput.value);
    if(!isNaN(input)) {
      animationFrameSkip = input;
    }
    else animationFrameSkipInput.value = animationFrameSkip;
  }

  symbolicFilter.onkeydown = function () {
    if (event.key === "Enter") {}
    else return;

    symbolicFilterQuery = d3.select("#search")[0][0].value;
    this.select() 
  };
});

d3.tsv("RawData\\kernelImageData.tsv", function(rawImageKernelData) {
  kernelImageData = rawImageKernelData.map(function(d) {
    d.values = d.values.split(";").slice(0,-1).map(function(v) {
      return v.split(",").map(function(val) {
        return parseFloat(val);
      });
    });
    return d;
  });
  kernelImageResolution = kernelImageData[0].values.length;
  var allValues = [];
  kernelImageData.forEach(d => allValues.push(d.values.flat()));
  kernelPixelValueBounds = d3.extent(allValues.flat());
  if(Math.abs(kernelPixelValueBounds[0]) > kernelPixelValueBounds[1]) kernelPixelValueBounds[1] = Math.abs(kernelPixelValueBounds[0]);
  else kernelPixelValueBounds[0] = -kernelPixelValueBounds[1];
  fillKernelReferenceCanvas();
});
 
// render polylines i to i+render_speed 
function render_range(selection, i, max, opacity) {
  selection.slice(i,max).forEach(function(d) {
    path(d, foreground, color(d,opacity,colorPalette,colorBounds));
  });
};

// simple data table
function data_table(sample) {
  var table = d3.select("#kernel-list")
    .html("")
    .selectAll(".row")
      .data(sample)
    .enter().append("div")
      .on("mouseover", highlight)
      .on("mouseout", unhighlight)
      .on("click", details);

  table
    .append("span")
      .attr("class", "color-block")
      .style("background", function(d) { return color(d,0.85, colorPalette,colorBounds) })

  table
    .append("span")
      .text(function(d) { return [d.id, d.Scale, d.TimeConstant, d.Angle, d.Ratio, d.dx, d.dy, d.Evaluation].join(", "); })
}

// Adjusts rendering speed 
function optimize(timer) {
  var delta = (new Date()).getTime() - timer;
  render_speed = Math.max(Math.ceil(render_speed * 30 / delta), 8);
  render_speed = Math.min(render_speed, 300);
  return (new Date()).getTime();
}

// Feedback on rendering progress
function render_stats(i,n,render_speed) {
  d3.select("#rendered-count").text(i);
  d3.select("#rendered-bar")
    .style("width", (100*i/n) + "%");
  d3.select("#render-speed").text(render_speed);
}

// Feedback on selection
function selection_stats(opacity, n, total) {
  d3.select("#data-count").text(total);
  d3.select("#selected-count").text(n);
  d3.select("#selected-bar").style("width", (100*n/total) + "%");
  d3.select("#opacity").text((""+(opacity*100)).slice(0,4) + "%");
}

// Highlight single polyline
function highlight(d) {
  d3.select("#foreground").style("opacity", "0.25");
  d3.selectAll(".row").style("opacity", function(p) { return (d.group == p) ? null : "0.3" });
  path(d, highlighted, color(d,1, colorPalette,colorBounds));
}

// Remove highlight
function unhighlight() {
  d3.select("#foreground").style("opacity", null);
  d3.selectAll(".row").style("opacity", null);
  highlighted.clearRect(0,0,w,h);
  if (alwaysHighlight) highlight(alwaysHighlight);
}

function invert_axis(d) {
  // save extent before inverting
  if (!yscale[d].brush.empty()) {
    var extent = yscale[d].brush.extent();
  }
  if (yscale[d].inverted == true) {
    yscale[d].range([h, 0]);
    d3.selectAll('.label')
      .filter(function(p) { return p == d; })
      .style("text-decoration", null);
    yscale[d].inverted = false;
  } else {
    yscale[d].range([0, h]);
    d3.selectAll('.label')
      .filter(function(p) { return p == d; })
      .style("text-decoration", "underline");
    yscale[d].inverted = true;
  }
  return extent;
}

// Draw a single polyline
/*
function path(d, ctx, color) {
  if (color) ctx.strokeStyle = color;
  var x = xscale(0)-15;
      y = yscale[dimensions[0]](d[dimensions[0]]);   // left edge
  ctx.beginPath();
  ctx.moveTo(x,y);
  dimensions.map(function(p,i) {
    x = xscale(p),
    y = yscale[p](d[p]);
    ctx.lineTo(x, y);
  });
  ctx.lineTo(x+15, y);                               // right edge
  ctx.stroke();
}
*/

function path(d, ctx, color) {
  if (color) ctx.strokeStyle = color;
  ctx.beginPath();
  var x0 = xscale(0)-15,
      y0 = yscale[dimensions[0]](d[dimensions[0]]);   // left edge
  ctx.moveTo(x0,y0);
  dimensions.map(function(p,i) {
    var x = xscale(p),
        y = yscale[p](d[p]);
    var cp1x = x - 0.88*(x-x0);
    var cp1y = y0;
    var cp2x = x - 0.12*(x-x0);
    var cp2y = y;
    ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x, y);
    x0 = x;
    y0 = y;
  });
  ctx.lineTo(x0+15, y0);                               // right edge
  ctx.stroke();
};

function interpolateColors(t, c1, c2) {
  var r = (1-t) * c1[0] + t * c2[0],
      g = (1-t) * c1[1] + t * c2[1],
      b = (1-t) * c1[2] + t * c2[2];
  return [r, g, b];
}

// Deprecated static color interpolation
/*function color(d,a) {
  var evalMid = 0.5 * (colorBounds[0] + colorBounds[1]);
  var t, c;

  if (colorBounds[0] == colorBounds[1]) {
    c = [255, 255, 255];
  }
  else if (d[colorDim] < evalMid) {
    t = (d[colorDim] - colorBounds[0]) / (evalMid - colorBounds[0]);
    c = [t * 255, t * 255, 255];
  }
  else {
    t = 1 - (d[colorDim] - evalMid) / (evalMid - colorBounds[0]);
    c = [255, t * 255, t * 255];
  }
  
  return ["rgba(",c[0],",",c[1],",",c[2],",",a,")"].join("");
}*/

function color(d,a,palette,bounds) {
  var evalFraction = 1 / (palette.length - 1);
  var t, c;

  if (bounds[0] == bounds[1]) {
    if (palette.length % 2)
      c = palette[(palette.length - 1) / 2];
    else
      c = interpolateColors(0.5, palette[palette.length / 2 - 1], palette[palette.length / 2])
  }
  else {
    if(typeof d === 'object') t = Math.max(0, Math.min((d[colorDim] - bounds[0]) / (bounds[1] - bounds[0]), 1));
    else t = Math.max(0, Math.min((d - bounds[0]) / (bounds[1] - bounds[0]), 1));

    var colorIdx = Math.floor(t / evalFraction);
    if (colorIdx > palette.length - 2) {
      colorIdx = palette.length - 2;
      t = 1;
    }
    else t = t / evalFraction - colorIdx;
    c = interpolateColors(t, palette[colorIdx], palette[colorIdx+1]);
  }
  
  return ["rgba(",c[0],",",c[1],",",c[2],",",a,")"].join("");
}

function position(d) {
  var v = dragging[d];
  return v == null ? xscale(d) : v;
}

// Handles a brush event, toggling the display of foreground lines.
// Added timestep filter before any other selection.
// TODO refactor
function brush() {

  brush_count++;
  var actives = dimensions.filter(function(p) { return !yscale[p].brush.empty(); }),
      extents = actives.map(function(p) { return yscale[p].brush.extent(); });

  // hack to hide ticks beyond extent
  var b = d3.selectAll('.dimension')[0]
    .forEach(function(element, i) {
      var dimension = d3.select(element).data()[0];
      if (_.include(actives, dimension)) {
        var extent = extents[actives.indexOf(dimension)];
        d3.select(element)
          .selectAll('text')
          .style('font-weight', function() { 
            var value = d3.select(this).data();
            return extent[0] <= value && value <= extent[1] ? 'bold' : null
          })
          .style('font-size', '13px');
      } else {
        d3.select(element)
          .selectAll('text')
          .style('font-size', null)
          .style('font-weight', null)
          .style('display', null);
      }
      d3.select(element)
        .selectAll('.label')
        .style('display', null);
    });
    ;
 
  // bold dimensions with label
  d3.selectAll('.label')
    .style("font-weight", function(dimension) {
      if (_.include(actives, dimension)) return "bold";
      return null;
    });

  // Get lines within extents
  var selected = [];
  data
    .filter(function(d) {
      return !_.contains(excluded_groups, d.group);
    })
    .map(function(d) {
      return actives.every(function(p, dimension) {
        return extents[dimension][0] <= d[p] && d[p] <= extents[dimension][1];
      }) ? selected.push(d) : null;
    });

  // Timestep filter
  selected = searchTimestep(selected);

  // free text search
  selected = searchBoolean(selected, symbolicFilterQuery);

  if (selected.length < data.length && selected.length > 0) {
    d3.select("#keep-data").attr("disabled", null);
    d3.select("#exclude-data").attr("disabled", null);
  } else {
    d3.select("#keep-data").attr("disabled", "disabled");
    d3.select("#exclude-data").attr("disabled", "disabled");
  };

  // Sets new color bounds, if enabled.
  if(document.getElementById("AlwaysNormalise").checked || normaliseColorMappingVar) {
    colorBounds = d3.extent(selected.map(x => x[colorDim]));
    normaliseColorMappingVar = false;
  }

  // Render selected lines
  paths(selected, foreground, brush_count, true);

  if (alwaysHighlight && (alwaysHighlight.timestep < showTimestepBounds[0] || alwaysHighlight.timestep >= showTimestepBounds[1])) {
    var prevId = alwaysHighlight.id;
    var prevTimestep = alwaysHighlight.timestep;
    hideDetails();
    details(data.filter((d) => d.id == prevId && d.timestep == Math.max(showTimestepBounds[0], Math.min(prevTimestep, showTimestepBounds[1]-1)))[0]);
    highlight(alwaysHighlight);
  }
}

// render a set of polylines on a canvas
function paths(selected, ctx, count) {
  var n = selected.length,
      i = 0,
      opacity = d3.min([2/Math.pow(n,0.3),1]),
      timer = (new Date()).getTime();

  selection_stats(opacity, n, data.length)

  data_table(selected);

  ctx.clearRect(0,0,w+1,h+1);

  // render all lines until finished or a new brush event
  function animloop(){
    if (i >= n || count < brush_count) return true;
    var max = d3.min([i+render_speed, n]);
    render_range(selected, i, max, opacity);
    render_stats(max,n,render_speed);
    i = max;
    timer = optimize(timer);  // adjusts render_speed
  };

  d3.timer(animloop);
}

// transition ticks for reordering, rescaling and inverting
function update_ticks(d, extent) {
  // update brushes
  if (d) {
    var brush_el = d3.selectAll(".brush")
        .filter(function(key) { return key == d; });
    // single tick
    if (extent) {
      // restore previous extent
      brush_el.call(yscale[d].brush = d3.svg.brush().y(yscale[d]).extent(extent).on("brush", brush));
    } else {
      brush_el.call(yscale[d].brush = d3.svg.brush().y(yscale[d]).on("brush", brush));
    }
  } else {
    // all ticks
    d3.selectAll(".brush")
      .each(function(d) { d3.select(this).call(yscale[d].brush = d3.svg.brush().y(yscale[d]).on("brush", brush)); })
  }

  brush_count++;

  show_ticks();

  // update axes
  d3.selectAll(".axis")
    .each(function(d,i) {
      // hide lines for better performance
      d3.select(this).selectAll('line').style("display", "none");

      // transition axis numbers
      d3.select(this)
        .transition()
        .duration(720)
        .call(axis.scale(yscale[d]));

      // bring lines back
      d3.select(this).selectAll('line').transition().delay(800).style("display", null);

      d3.select(this)
        .selectAll('text')
        .style('font-weight', null)
        .style('font-size', null)
        .style('display', null);
    });
}

// Rescale to new dataset domain
function rescale() {
  // reset yscales, preserving inverted state
  dimensions.forEach(function(d,i) {
    if (yscale[d].inverted) {
      yscale[d] = d3.scale.linear()
          .domain(d3.extent(data, function(p) { return +p[d]; }))
          .range([0, h]);
      yscale[d].inverted = true;
    } else {
      yscale[d] = d3.scale.linear()
          .domain(d3.extent(data, function(p) { return +p[d]; }))
          .range([h, 0]);
    }
  });

  update_ticks();

  // Render selected data
  paths(data, foreground, brush_count);
}

// Get polylines within extents
function actives() {
  var actives = dimensions.filter(function(p) { return !yscale[p].brush.empty(); }),
      extents = actives.map(function(p) { return yscale[p].brush.extent(); });

  // filter extents and excluded groups
  var selected = [];
  data
    .filter(function(d) {
      return !_.contains(excluded_groups, d.group);
    })
    .map(function(d) {
    return actives.every(function(p, i) {
      return extents[i][0] <= d[p] && d[p] <= extents[i][1];
    }) ? selected.push(d) : null;
  });

  selected = searchTimestep(selected);

  if (symbolicFilterQuery.length > 0) {
    selected = searchBoolean(selected, symbolicFilterQuery);
  }

  return selected;
}

// Export data
function export_csv() {
  var keys = d3.keys(data[0]);
  var rows = actives().map(function(row) {
    return keys.map(function(k) { return row[k]; })
  });
  var tsv = d3.tsv.format([keys].concat(rows)).replace(/\n/g,"<br/>\n");
  var styles = "<style>body { font-family: sans-serif; font-size: 12px; }</style>";
  window.open("text/csv").document.write(styles + tsv);
}

// scale to window size
window.onresize = function() {
  width = document.body.clientWidth,
  height = d3.max([document.body.clientHeight-500, 220]);

  w = width - m[1] - m[3],
  h = height - m[0] - m[2];

  d3.select("#chart")
      .style("height", (h + m[0] + m[2]) + "px")

  d3.selectAll("canvas")
      .attr("width", w)
      .attr("height", h)
      .style("padding", m.join("px ") + "px");

  d3.select("svg")
      .attr("width", w + m[1] + m[3])
      .attr("height", h + m[0] + m[2])
    .select("g")
      .attr("transform", "translate(" + m[3] + "," + m[0] + ")");
  
  xscale = d3.scale.ordinal().rangePoints([0, w], 1).domain(dimensions);
  dimensions.forEach(function(d) {
    yscale[d].range([h, 0]);
  });

  d3.selectAll(".dimension")
    .attr("transform", function(d) { return "translate(" + xscale(d) + ")"; })
  // update brush placement
  d3.selectAll(".brush")
    .each(function(d) { d3.select(this).call(yscale[d].brush = d3.svg.brush().y(yscale[d]).on("brush", brush)); })
  brush_count++;

  // update axis placement
  axis = axis.ticks(1+height/50),
  d3.selectAll(".axis")
    .each(function(d) { d3.select(this).call(axis.scale(yscale[d])); });

  // render data
  brush();
};

// Remove all but selected from the dataset
function keep_data() {
  new_data = actives();
  if (new_data.length == 0) {
    alert("I don't mean to be rude, but I can't let you remove all the data.\n\nTry removing some brushes to get your data back. Then click 'Keep' when you've selected data you want to look closer at.");
    return false;
  }
  data = new_data;
  rescale();
  brush();
}

// Exclude selected from the dataset
function exclude_data() {
  new_data = _.difference(data, actives());
  if (new_data.length == 0) {
    alert("I don't mean to be rude, but I can't let you remove all the data.\n\nTry selecting just a few data points then clicking 'Exclude'.");
    return false;
  }
  data = new_data;
  rescale();
  brush();
}

function remove_axis(d,g) {
  dimensions = _.difference(dimensions, [d]);
  xscale.domain(dimensions);
  g.attr("transform", function(p) { return "translate(" + position(p) + ")"; });
  g.filter(function(p) { return p == d; }).remove(); 
  update_ticks();
}

d3.select("#keep-data").on("click", keep_data);
d3.select("#exclude-data").on("click", exclude_data);
d3.select("#export-data").on("click", export_csv);
d3.select("#search").on("keyup", brush);


// Appearance toggles
d3.select("#hide-ticks").on("click", hide_ticks);
d3.select("#show-ticks").on("click", show_ticks);

function hide_ticks() {
  d3.selectAll(".axis g").style("display", "none");
  //d3.selectAll(".axis path").style("display", "none");
  d3.selectAll(".background").style("visibility", "hidden");
  d3.selectAll("#hide-ticks").attr("disabled", "disabled");
  d3.selectAll("#show-ticks").attr("disabled", null);
};

function show_ticks() {
  d3.selectAll(".axis g").style("display", null);
  //d3.selectAll(".axis path").style("display", null);
  d3.selectAll(".background").style("visibility", null);
  d3.selectAll("#show-ticks").attr("disabled", "disabled");
  d3.selectAll("#hide-ticks").attr("disabled", null);
};

function searchBoolean(selection, str) {
  var clauses = str.toLowerCase().split(" and ");
  clauses = clauses.map(x => x.split(" or "));
  var regExpDims = Object.keys(attrDict).join("|");
  pattern = new RegExp("(" + regExpDims + ") *(<|>|!=|==|<=|>=) *[0-9]+(\.[0-9]*)?","i")
  cleanedClauses = [];
  for (let i = 0; i < clauses.length; i++) {
    cleanedClause = [];
    for (let j = 0; j < clauses[i].length; j++) {
      if (pattern.exec(clauses[i][j])) cleanedClause.push(clauses[i][j]);
    }
    if (cleanedClause.length > 0) cleanedClauses.push(cleanedClause);
  }

  filteredSelection = []
  for (const kernel of selection) {
    includeKernel = true
    for (const c of cleanedClauses) {
      clauseSatisfied = false;
      for (const v of c) {
        var sv = v.split(" ");
        var attr = attrDict[sv[0]];
        if (eval("kernel." + attr + sv.slice(1).join(" "))) {
          clauseSatisfied = true;
          break;
        }
      }
      if (!clauseSatisfied) {
        includeKernel = false;
        break;
      }
    }
    if (includeKernel) filteredSelection.push(kernel);
  }
  return filteredSelection;
}

function searchTimestep(selection) {
  return _(selection).filter(function(d) { return d.timestep >= showTimestepBounds[0] && d.timestep < showTimestepBounds[1]; })
}

function selectAxisForColor() {
  newDimension = document.getElementById("colorDimensions").value;
  colorDim = newDimension;
  colorBounds = d3.extent(data.map(x => x[colorDim]));
  brush();
}

function normaliseColorMapping() {
  normaliseColorMappingVar = true;
  brush();
}

function addColor() {
  const el = document.createElement('p');
  colorPickerContainer.appendChild(el);

  var pickr = new Pickr(Object.assign({
    el, theme: 'monolith',
    default: ["#", colorPalette[colorPalette.length-1][0].toString(16).padStart(2, '0'), colorPalette[colorPalette.length-1][1].toString(16).padStart(2, '0'), colorPalette[colorPalette.length-1][2].toString(16).padStart(2, '0')].join(""),
    comparison: false
  }, colorPickerConfig));
  pickr.on('change', changeColorForData);
  dataPickrs.push(pickr);

  colorPalette.push(colorPalette[colorPalette.length-1]);

  brush();
}

function removeColor(clear) {
  if (colorPalette.length < 3 && !clear) return; 
  colorPickerContainer.removeChild(colorPickerContainer.lastChild);

  dataPickrs.pop().destroy();

  colorPalette.pop();
  
  if (!clear) brush();
}

function changeColorForData() {
  //changeColor(colorPalette, dataPickrs);
  colorPalette = [];
  for (const p of dataPickrs) {
    var pickrColor = p.getColor().toHEXA();
    colorPalette.push([parseInt(pickrColor[0], 16), parseInt(pickrColor[1], 16), parseInt(pickrColor[2], 16)]);
  }

  brush();
}

function changeColorForPixels() {
  kernelPixelColorPalette = [];
  for (const p of pixelPickrs) {
    var pickrColor = p.getColor().toHEXA();
    kernelPixelColorPalette.push([parseInt(pickrColor[0], 16), parseInt(pickrColor[1], 16), parseInt(pickrColor[2], 16)]);
  }

  details(alwaysHighlight);
  fillKernelReferenceCanvas();
}

function colorPalettePicker(number) {
  var start = 2;
  var i = 0;
  var colors = [];

  while (number > 0) {
    colors.push(colorBrewerPalette[start+i*3]);
    i = (i + 1) % 4;
    if (i == 0) start -= 1;
    number -= 1;
  }
  
  return colors;
}

function extendColors() {
  const number = colorAmount.value;
  if (number <= colorPalette.length) return;

  var colorsToAdd = colorPalettePicker(number - colorPalette.length);

  for (const color of colorsToAdd) {
    const el = document.createElement('p');
    colorPickerContainer.appendChild(el);

    var pickr = new Pickr(Object.assign({
      el, theme: 'monolith',
      default: ["#", color[0].toString(16).padStart(2, '0'), color[1].toString(16).padStart(2, '0'), color[2].toString(16).padStart(2, '0')].join(""),
      comparison: false
    }, colorPickerConfig));
    pickr.on('change', changeColorForData);
    dataPickrs.push(pickr);

    colorPalette.push(color);
  }

  brush();
}

function replaceColors() {
  while (colorPalette.length > 0) {
    removeColor(true);
  }
  extendColors();
}

function details(d) {
  alwaysHighlight = d;

  instructions.style.display = "none";
  detailsOnDemand.style.display = "grid";

  const kernel = kernelImageData.filter((imageData) => imageData.id == d.id % kernelImageData.length && imageData.timestep == d.timestep)[0];

  
  kernelAttributes.replaceChildren([]);
  for(const [k, v] of Object.entries(d)) {
    var child = document.createElement("div");
    child.classList.add("kernel-attribute");

    var childAttributeName = document.createElement("p");
    childAttributeName.classList.add("kernel-attribute-name")
    childAttributeName.innerHTML = "<b>" + k + ":</b>"
    child.appendChild(childAttributeName);

    var childAttributeValue = document.createElement("p");
    childAttributeValue.classList.add("kernel-attribute-value")
    childAttributeValue.innerHTML = Number(v.toPrecision(3))
    child.appendChild(childAttributeValue);

    kernelAttributes.appendChild(child);
  }

  if (kernel != undefined) {
    const kernel_values = kernel.values;

    for (let i = 0; i < kernelImageResolution; i++)
      for(let j = 0; j < kernelImageResolution; j++) {
        kernelImage.fillStyle = color(kernel_values[i][j], 1, kernelPixelColorPalette, kernelPixelValueBounds);
        kernelImage.fillRect(i*200/kernelImageResolution, j*200/kernelImageResolution, 200/kernelImageResolution, 200/kernelImageResolution);
      }
  }
  else {
    const kernel_values = [[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
                          [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
                          [0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,1,1,0,0,0,0,0,1,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
                          [0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,0,0,0,0,0,1,1,0,0,0,0,1,1,1,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
                          [0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,1,0,0,0,0,1,1,0,0,0,1,1,1,0,0,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
                          [0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,1,0,0,0,0,1,1,0,0,0,1,1,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
                          [0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,0,1,1,0,0,0,1,1,0,0,1,1,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
                          [0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,0,1,1,0,0,0,1,1,0,0,1,1,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
                          [0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,0,0,1,1,0,0,1,1,0,0,1,1,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
                          [0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,0,0,1,1,0,0,1,1,0,0,1,1,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
                          [0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,0,0,0,1,1,0,1,1,0,0,1,1,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
                          [0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,0,0,0,1,1,0,1,1,0,0,1,1,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
                          [0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,0,0,0,0,1,1,1,1,0,0,0,1,1,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
                          [0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,0,0,0,0,1,1,1,1,0,0,0,1,1,1,0,0,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
                          [0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,1,1,1,0,0,0,0,1,1,1,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
                          [0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,1,1,0,0,0,0,0,1,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
                          [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
                          [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
                          [0,0,1,1,1,1,1,1,0,0,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,1,1,1,1,1,1,1,1,1,1,0,0,0,0,0,0,1,1,0,0,0,0,0,0],
                          [0,0,1,1,1,1,1,1,1,0,0,0,0,0,0,0,0,1,1,1,1,0,0,0,0,0,1,1,1,1,1,1,1,1,1,1,0,0,0,0,0,1,1,1,1,0,0,0,0,0],
                          [0,0,1,1,0,0,0,1,1,1,0,0,0,0,0,0,0,1,1,1,1,0,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,1,1,1,1,0,0,0,0,0],
                          [0,0,1,1,0,0,0,0,1,1,1,0,0,0,0,0,1,1,0,0,1,1,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,1,1,0,0,1,1,0,0,0,0],
                          [0,0,1,1,0,0,0,0,0,1,1,0,0,0,0,0,1,1,0,0,1,1,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,1,1,0,0,1,1,0,0,0,0],
                          [0,0,1,1,0,0,0,0,0,1,1,1,0,0,0,0,1,1,0,0,1,1,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,1,1,0,0,1,1,0,0,0,0],
                          [0,0,1,1,0,0,0,0,0,0,1,1,0,0,0,1,1,0,0,0,0,1,1,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,1,1,0,0,0,0,1,1,0,0,0],
                          [0,0,1,1,0,0,0,0,0,0,1,1,0,0,0,1,1,0,0,0,0,1,1,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,1,1,0,0,0,0,1,1,0,0,0],
                          [0,0,1,1,0,0,0,0,0,1,1,1,0,0,0,1,1,1,1,1,1,1,1,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,1,1,1,1,1,1,1,1,0,0,0],
                          [0,0,1,1,0,0,0,0,0,1,1,0,0,0,0,1,1,1,1,1,1,1,1,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,1,1,1,1,1,1,1,1,0,0,0],
                          [0,0,1,1,0,0,0,0,1,1,1,0,0,0,1,1,0,0,0,0,0,0,1,1,0,0,0,0,0,0,1,1,0,0,0,0,0,0,1,1,0,0,0,0,0,0,1,1,0,0],
                          [0,0,1,1,0,0,0,1,1,1,0,0,0,0,1,1,0,0,0,0,0,0,1,1,0,0,0,0,0,0,1,1,0,0,0,0,0,0,1,1,0,0,0,0,0,0,1,1,0,0],
                          [0,0,1,1,1,1,1,1,1,0,0,0,0,0,1,1,0,0,0,0,0,0,1,1,0,0,0,0,0,0,1,1,0,0,0,0,0,0,1,1,0,0,0,0,0,0,1,1,0,0],
                          [0,0,1,1,1,1,1,1,0,0,0,0,0,0,1,1,0,0,0,0,0,0,1,1,0,0,0,0,0,0,1,1,0,0,0,0,0,0,1,1,0,0,0,0,0,0,1,1,0,0],
                          [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
                          [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
                          [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
                          [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
                          [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
                          [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
                          [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
                          [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
                          [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
                          [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
                          [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
                          [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
                          [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
                          [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
                          [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
                          [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
                          [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
                          [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]];
    for (let i = 0; i < 50; i++)
      for(let j = 0; j < 50; j++) {
        var value = kernel_values[j][i]*255;
        kernelImage.fillStyle = '#' + value.toString(16).padStart(2, 0)+value.toString(16).padStart(2, 0)+value.toString(16).padStart(2, 0); //Placeholder greyscale.
        kernelImage.fillRect(i*4, j*4, 4, 4);
      }
  }
}

function hideDetails() {
  alwaysHighlight = undefined;
  unhighlight();

  instructions.style.display = "block";
  detailsOnDemand.style.display = "none";
}

function fillKernelReferenceCanvas() {
  for(let i = 0; i < 200; i++) {
    kernelReference.fillStyle = color(kernelPixelValueBounds[0] + i * (kernelPixelValueBounds[1] - kernelPixelValueBounds[0])/199, 1, kernelPixelColorPalette, kernelPixelValueBounds);
    kernelReference.fillRect(i, 0, 1, 20);
  }
  kernelReference.font = "20px Arial";
  kernelReference.fillStyle = '#'+(16777215 - parseInt(pixelPickrs[0].getColor().toHEXA().toString().substring(1), 16)).toString(16).padStart(6, '000000');
  kernelReference.fillText(kernelPixelValueBounds[0].toString(), 2, 18);

  kernelReference.fillStyle = '#'+(16777215 -parseInt(pixelPickrs[1].getColor().toHEXA().toString().substring(1), 16)).toString(16).padStart(6, '000000');
  let t1 = '0';
  kernelReference.fillText(t1, 100-kernelReference.measureText(t1).width/2, 18);

  kernelReference.fillStyle = '#'+(16777215 -parseInt(pixelPickrs[2].getColor().toHEXA().toString().substring(1), 16)).toString(16).padStart(6, '000000');
  let t2 = kernelPixelValueBounds[1].toString();
  kernelReference.fillText(t2, 198-kernelReference.measureText(t2).width, 18);
}

function animateSlider() {
  var limitReached = false;
  if((animationDir == 1 && sliderBounds[1].value == slider.noUiSlider.options.range.max) || (animationDir == -1 && sliderBounds[0].value == slider.noUiSlider.options.range.min)) limitReached = true;

  if(limitReached) {
    if(animationEndReachedAction == 0) {
      animateSliderStop();
      return;
    }
    if(animationEndReachedAction == 1) {
      var diff = sliderBounds[1].value - sliderBounds[0].value;
      if(animationDir > 0) slider.noUiSlider.set([0, diff]);
      else slider.noUiSlider.set([slider.noUiSlider.options.range.max - diff, slider.noUiSlider.options.range.max]);
      return;
    }
    if(animationEndReachedAction == 2) {
      animationDir = -animationDir;
    }
  }

  if (animationDir < 0) {
    sliderBounds[0].onkeydown();
    sliderBounds[1].onkeydown();
  }
  else {
    sliderBounds[1].onkeydown();
    sliderBounds[0].onkeydown();
  }

  if (animationFrameSkipOverstep < 0) {
    correctFrameSkipOverstep()
    animationFrameSkipOverstep = 0;
  }
}

function correctFrameSkipOverstep() {
  var currentVals = slider.noUiSlider.get();
  if (animationDir < 0) slider.noUiSlider.set(currentVals[0] + animationFrameSkipOverstep, currentVals[1] + animationFrameSkipOverstep);
  else slider.noUiSlider.set(currentVals[0] - animationFrameSkipOverstep, currentVals[1] - animationFrameSkipOverstep);
}

function animateSliderForwards() {
  if (animateSliderHandle) animateSliderStop();
  animateSliderActive = true;
  animationDir = 1;
  animateSliderHandle = window.setInterval(animateSlider, 1000 / animationFPS);
}

function animateSliderBackwards() {
  if (animateSliderHandle) animateSliderStop();
  animateSliderActive = true;
  animationDir = -1;
  animateSliderHandle = window.setInterval(animateSlider, 1000 / animationFPS);
}

function animateSliderStop() {
  animateSliderActive = false;
  animationDir = 0;
  window.clearInterval(animateSliderHandle);
}

function animateSliderReset() {
  window.clearInterval(animateSliderHandle);
  animateSliderHandle = window.setInterval(animateSlider, 1000 / animationFPS);
}

function stepSliderForwards() {
  animateSliderActive = true;
  animationDir = 1;
  animateSlider();
  animationDir = 0;
  animateSliderActive = false;
}

function stepSliderBackwards() {
  animateSliderActive = true;
  animationDir = -1;
  animateSlider();
  animationDir = 0;
  animateSliderActive = false;
}

function selectAnimationLimitAction() {
  animationEndReachedAction = parseInt(animationEndReachedActionMenu.value);
}