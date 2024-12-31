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
  const float held_back_chance = 0.25;

  float random (vec2 st) {
    return fract(sin(dot(st.xy,
                          vec2(12.9898,78.233)))*
        43758.5453123);
  }


  void main() {
    vec4 col = texture2D(growth, uv);
    vec2 st = gl_FragCoord.rg/resolution.rg;
    float rnd = random(st);
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
            sumColor += neighbor;
            count += 1.0;
            nudge = vec3(random(offset),random(offset+.1),random(offset+.2)) * .2;
          }
        }
      }

      if (count > 0.0) {
        vec3 avgColor = sumColor.rgb / count;
        float tint = count / 8.0;
        //if (rnd < held_back_chance){
          // chance of staying undrawn pixel
          gl_FragColor = vec4(0.0, 0, 0, 0.0);
        //}
        //else{
          gl_FragColor = vec4((avgColor + nudge) , 1.0)* step((1.0-held_back_chance),rnd);
        //}
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

let growthTexture;

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
      if (Math.random() < 0.1) {
        growthData[i] = imageData.data[i];
        growthData[i + 1] = imageData.data[i + 1];
        growthData[i + 2] = imageData.data[i + 2];
        growthData[i + 3] = 255;
      } else {
        growthData[i + 3] = 0;
      }
    }

    growthTexture = createGrowthTexture(growthData);
    render();
  };
});

function render() {
  gl.uniform2f(resolutionLoc, imgWidth, imgHeight);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  setTimeout(render,200);
}

