const canvas = document.getElementById('webgl-canvas');
const gl = canvas.getContext('webgl2');
const upload = document.getElementById('upload');

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
            nudge = vec3(random(offset),random(offset+.1),random(offset+.2)) * .05;
          }
        }
      }

      if (count > 0.0) {
        vec3 avgColor = sumColor.rgb;// / count;
        float tint = count / 8.0;

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

upload.addEventListener('change', (event) => {
  const file = event.target.files[0];
  const img = new Image();
  img.src = URL.createObjectURL(file);
  img.onload = () => {
    const offscreen = document.createElement('canvas');
    const ctx = offscreen.getContext('2d');
    canvas.width = img.width;
    canvas.height = img.height;
    imgWidth = img.width;
    imgHeight = img.height;
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
      if (Math.random() < 0.05) {
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
    //framebuffer = buffer1;
    //nextTexture = buffer2.texture;

    gl.bindFramebuffer(gl.FRAMEBUFFER, buffer2.fbo);
    gl.viewport(0, 0, imgWidth, imgHeight);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, growthTexture);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    render();
  };
});

// Add these variables to your global scope
let pixelBuffer1 = null;
let pixelBuffer2 = null;
let hasChanged = true;

function compareTextures() {
  // Initialize buffers if they don't exist
  if (!pixelBuffer1) {
    pixelBuffer1 = new Uint8Array(imgWidth * imgHeight * 4);
    pixelBuffer2 = new Uint8Array(imgWidth * imgHeight * 4);
  }

  // Read pixels from both textures
  gl.bindFramebuffer(gl.FRAMEBUFFER, buffer1.fbo);
  gl.readPixels(0, 0, imgWidth, imgHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixelBuffer1);

  gl.bindFramebuffer(gl.FRAMEBUFFER, buffer2.fbo);
  gl.readPixels(0, 0, imgWidth, imgHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixelBuffer2);

  // Compare pixels (sample every Nth pixel for performance)
  const sampleRate = 100; // Check every 10th pixel
  const threshold = 1; // Minimum difference to consider as change

  for (let i = 0; i < pixelBuffer1.length; i += 4 * sampleRate) {
    const diff = Math.abs(pixelBuffer1[i + 3] - pixelBuffer2[i + 3]); // Compare alpha
    if (diff > threshold) {
      return true;
    }
  }

  return false;
}

const timeLocation = gl.getUniformLocation(program, 'time');
let currentTime = performance.now() * 0.001; // Convert to seconds
gl.uniform1f(timeLocation, currentTime);

const debugInfo = document.createElement('div');
document.body.appendChild(debugInfo);

// Add this to the render function before requestAnimationFrame

// render starting using the growth texture for input
// render into buffer 1 texture
// use growth texture for drawing to the screen
// render into growth texture
let stable_frames = 0;
let frame_count = 0;
function render() {
  debugInfo.textContent = `Frame: ${currentTime.toFixed(2)}s, Changed: ${hasChanged}`;
  currentTime = performance.now() * 0.001; // Convert to seconds
  gl.uniform1f(timeLocation, currentTime);

  // Step 1: Render simulation step using current state
  gl.bindFramebuffer(gl.FRAMEBUFFER, buffer1.fbo);
  gl.viewport(0, 0, imgWidth, imgHeight);

  // Bind the previous frame's texture as input
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, buffer2.texture);

  // Set uniforms and render
  gl.uniform2f(resolutionLoc, imgWidth, imgHeight);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

  // Check if simulation is still changing
  if(frame_count++ % 4){
    if (typeof screen.orientation !== 'undefined') {
      hasChanged = true;
    }
    else{
      hasChanged = compareTextures();
    }

    if(!hasChanged){
      stable_frames++;
    }
    else{
      stable_frames = 0;
    }
  }

  currentTime = performance.now() * 0.001; // Convert to seconds
  gl.uniform1f(timeLocation, currentTime);

  // Step 2: Render to screen
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, imgWidth, imgHeight);

  // Use the result of the simulation as input
  gl.bindTexture(gl.TEXTURE_2D, buffer1.texture);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

  // Step 3: Swap buffers for next frame
  const temp = buffer1;
  buffer1 = buffer2;
  buffer2 = temp;

  // Only continue rendering if the simulation is still changing
  if (stable_frames < 100) {
    requestAnimationFrame(render);
  } else {
    console.log('Simulation has stabilized');
    stable_frames = 0;
  }
}
