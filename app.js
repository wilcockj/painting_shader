const canvas = document.getElementById('webgl-canvas');
const image_canvas = document.getElementById('basic_image_canvas');
const image_canvas_handle = image_canvas.getContext('2d');
const gl = canvas.getContext('webgl2');
const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
const full_quality_checkbox = document.getElementById('full_quality');


let imgWidth = 1;
let imgHeight = 1;

// WebGL Setup
const vertexShaderSource = `
  attribute vec2 position;
  varying vec2 uv;
  void main() {
    uv = position * 0.5 + 0.5;
    gl_Position = vec4(position, 0, 1);
  }
`;

const fragmentShaderSource = `
  precision mediump float;
  varying vec2 uv;
  uniform sampler2D growth;
  uniform vec2 resolution;
  uniform float time;  // New uniform for time
  const float held_back_chance = 0.25;

  float random (vec2 st) {
    return fract(sin(dot(st.xy,
                          vec2(12.9898,78.233)))*
        43758.5453123);
  }


  void main() {
    vec4 col = texture2D(growth, uv);
    vec2 st = gl_FragCoord.rg/resolution.rg;
    float rnd = random(st+time);
    vec3 nudge = vec3(0.0);

    if (col.a < 0.01) {
      vec4 sumColor = vec4(0.0);
      float count = 0.0;

      // Check neighbors
      for (int x = -1; x <= 1; x++) {
        for (int y = -1; y <= 1; y++) {
          vec2 offset = vec2(float(x), float(y)) / resolution;
          vec4 neighbor = texture2D(growth, uv + offset);

          if (neighbor.a > 0.01) {
            sumColor = neighbor;
            count += 1.0;
	    float nudge_strength = .05;
	    // nudge randomly in random direction
            nudge = vec3(random(offset),random(offset+1.2),random(offset+2.8)) * nudge_strength * (2.0 * step(0.5,random(offset+3.5)) - 1.0);
          }
        }
      }

      if (count > 0.0) {
        vec3 avgColor = sumColor.rgb;// / count;

        // chance of being 0d out
        gl_FragColor = vec4(avgColor + nudge*step(1.0-held_back_chance/4.0,rnd), 1.0) * step((1.0-held_back_chance),rnd);

      } else {
        gl_FragColor = vec4(0.0, 0, 0, 0.0);
      }
    } else {
      gl_FragColor = col; // Retain existing color
    }
  }
`;

function compileShader(type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  return shader;
}

function createProgram(vsSource, fsSource) {
  const program = gl.createProgram();
  const vs = compileShader(gl.VERTEX_SHADER, vsSource);
  const fs = compileShader(gl.FRAGMENT_SHADER, fsSource);
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  return program;
}

const program = createProgram(vertexShaderSource, fragmentShaderSource);
gl.useProgram(program);

const vertices = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
const buffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

const position = gl.getAttribLocation(program, 'position');
gl.enableVertexAttribArray(position);
gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

const resolutionLoc = gl.getUniformLocation(program, 'resolution');
const timeLocation = gl.getUniformLocation(program, 'time');

let growthTexture, nextTexture;
let framebuffer;

let buffer1, buffer2;

// Create a framebuffer and attach a texture
function createFramebufferTexture(width, height) {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);

  // Explicitly initialize texture with blank data
  const blankData = new Uint8Array(width * height * 4);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, blankData);

  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  const fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);

  // Clear the framebuffer to initialize texture
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);

  gl.bindFramebuffer(gl.FRAMEBUFFER, null); // Unbind framebuffer
  return { texture, fbo };
}


function createGrowthTexture(imageData) {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, canvas.width, canvas.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, imageData);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return texture;
}

function inject_randomness(){
  let randomness = Math.random()*1000; // Convert to seconds
  gl.uniform1f(timeLocation, randomness);
}

const img = new Image();

let img_sample_rate = 0.05;

let render_started = false;
let full_quality = !isMobile;
full_quality_checkbox.checked = full_quality;

function init_sim(){
  
  if(img.src == ""){
    return;
  }
  stable_frames = 0;
  const offscreen = document.createElement('canvas');
  const ctx = offscreen.getContext('2d');
  canvas.width = img.width;
  canvas.height = img.height;
  image_canvas.width = img.width;
  image_canvas.height = img.height;
  imgWidth = img.width;
  imgHeight = img.height;

  if(!full_quality){
    // Scale down image for mobile
    const maxDimension = 512; // Limit size for mobile
    let width = img.width;
    let height = img.height;

    if (width > maxDimension || height > maxDimension) {
      if (width > height) {
        height = height * (maxDimension / width);
        width = maxDimension;
      } else {
        width = width * (maxDimension / height);
        height = maxDimension;
      }
    }

    canvas.width = width;
    canvas.height = height;
    image_canvas.width = width;
    image_canvas.height = height;
    imgWidth = width;
    imgHeight = height;
  }


  console.log("Current shader canvas dims = ", canvas.width, canvas.height);
  gl.viewport(0,0,canvas.width,canvas.height);
  offscreen.width = canvas.width;
  offscreen.height = canvas.height;
  console.log("Canvas size is ", canvas.width,canvas.height);
  ctx.scale(1, -1);
  ctx.translate(0, -canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

  const growthData = new Uint8Array(canvas.width * canvas.height * 4);
  for (let i = 0; i < growthData.length; i += 4) {
    growthData[i] = imageData.data[i];
    growthData[i + 1] = imageData.data[i + 1];
    growthData[i + 2] = imageData.data[i + 2];
    if (Math.random() < img_sample_rate) {
      growthData[i] = imageData.data[i];
      growthData[i + 1] = imageData.data[i + 1];
      growthData[i + 2] = imageData.data[i + 2];
      growthData[i + 3] = 255;
    } else {
      growthData[i + 3] = 0;
    }
  }



  // Create textures and framebuffer for ping-pong rendering
  growthTexture = createGrowthTexture(growthData);
  buffer1 = createFramebufferTexture(canvas.width, canvas.height);
  buffer2 = createFramebufferTexture(canvas.width, canvas.height);

  gl.bindFramebuffer(gl.FRAMEBUFFER, buffer2.fbo);
  gl.viewport(0, 0, imgWidth, imgHeight);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, growthTexture);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  if (!render_started) {
    // if render has been called before we should not call render
    // as that "thread" is already going
    render_started = true;
    render();
  }
}
const upload = document.getElementById('upload');

upload.addEventListener('change', (event) => {
  const file = event.target.files[0];
  img.src = URL.createObjectURL(file);
  img.onload = () => {
    init_sim();
  };
});

const sample_rate = document.getElementById('sample_rate');

sample_rate.addEventListener('change', (event) => {
  img_sample_rate = event.target.value;

  console.log("Sample rate is ",img_sample_rate);
  init_sim();

})

full_quality_checkbox.addEventListener('change', (event) => {
  full_quality = event.target.checked;
  console.log(event.target);
  init_sim();
})

const info_div = document.getElementById('info');
const debugInfo = document.createElement('div');
info_div.appendChild(debugInfo);

// render starting using the growth texture for input
// render into buffer 1 texture
// use growth texture for drawing to the screen
// render into growth texture
let frame_count = 0;
let lastTime = performance.now();
let frameCount = 0;

var mouseDown = false;
image_canvas.addEventListener('mousedown', function(evt) {
  if(evt.button == 0) {
    // left click
    console.log("MOUSE DOWN");
    mouseDown = true;
  }
});

image_canvas.addEventListener('mouseup', function(evt) {
  if(evt.button == 0) {
    // left click
    console.log("MOUSE UP");
    mouseDown = false;
  }
});

let first_draw = true;
let first_clear = true;

function render() {
  if(mouseDown){
    // show the original image
    if(first_draw){
      image_canvas_handle.drawImage(img,0,0,image_canvas.width,image_canvas.height);
      first_draw = false;
      first_clear = true;
    }
    setTimeout(() => {
        requestAnimationFrame(render);
      }, 1000 / 10);
    return;
  }
  else{
    if(first_clear){
      image_canvas_handle.clearRect(0,0,image_canvas.width,image_canvas.height);
      first_clear = false;
      first_draw = true;
    }
  }

  // In render function:
  frameCount++;
  let currentTime = performance.now();
  if (currentTime - lastTime >= 1000) {
      debugInfo.textContent = `FPS: ${frameCount}`;
      frameCount = 0;
      lastTime = currentTime;
  }

  inject_randomness();

  // Render simulation step using current state
  gl.bindFramebuffer(gl.FRAMEBUFFER, buffer1.fbo);
  gl.viewport(0, 0, imgWidth, imgHeight);

  // Bind the previous frame's texture as input
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, buffer2.texture);

  // Set uniforms and render
  gl.uniform2f(resolutionLoc, imgWidth, imgHeight);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);


  //currentTime = performance.now() * 0.001; // Convert to seconds
  inject_randomness();
  // Render to screen
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, imgWidth, imgHeight);

  // Use the result of the simulation as input
  gl.bindTexture(gl.TEXTURE_2D, buffer1.texture);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

  // Swap buffers for next frame
  const temp = buffer1;
  buffer1 = buffer2;
  buffer2 = temp;

  setTimeout(() => {
    requestAnimationFrame(render);
  }, 1000 / 30);
}

document.getElementById('save_result_button').addEventListener('click', saveCanvasAsImage);

function saveCanvasAsImage() {
  const width = canvas.width;
  const height = canvas.height;

  // Create a buffer to store pixel data
  const pixels = new Uint8Array(width * height * 4); // RGBA values
  gl.bindFramebuffer(gl.FRAMEBUFFER, buffer1.fbo);
  gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

  // Convert pixel data to an image
  const imageData = new ImageData(width, height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const srcIndex = (y * width + x) * 4;
      const destIndex = ((height - y - 1) * width + x) * 4; // Flip vertically
      imageData.data[destIndex] = pixels[srcIndex];     // R
      imageData.data[destIndex + 1] = pixels[srcIndex + 1]; // G
      imageData.data[destIndex + 2] = pixels[srcIndex + 2]; // B
      imageData.data[destIndex + 3] = pixels[srcIndex + 3]; // A
    }
  }
  console.log(imageData);

  // Create a new canvas to draw the image data
  const exportCanvas = document.createElement('canvas');
  exportCanvas.width = width;
  exportCanvas.height = height;
  const exportCtx = exportCanvas.getContext('2d');
  exportCtx.putImageData(imageData, 0, 0);

  // Convert the export canvas to a data URL and download
  const dataURL = exportCanvas.toDataURL('image/png');
  const link = document.createElement('a');
  link.href = dataURL;
  link.download = 'webgl-canvas.png';
  link.click();
}
