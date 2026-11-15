const vertexShaderSource = `#version 300 es
  in vec2 a_position;
  in vec2 a_texCoord;
  out vec2 v_texCoord;

  void main() {
    v_texCoord = a_texCoord;
    gl_Position = vec4(a_position, 0.0, 1.0);
  }
`;

const fragmentShaderSource = `#version 300 es
  precision mediump float;

  in vec2 v_texCoord;
  out vec4 outColor;

  uniform sampler2D u_texture;
  uniform float u_brightness;
  uniform float u_contrast;
  uniform float u_saturation;
  uniform float u_temperature;

  void main() {
    vec4 texColor = texture(u_texture, v_texCoord);
    vec3 color = texColor.rgb;

    color += vec3(u_brightness);
    color = (color - 0.5) * (1.0 + u_contrast) + 0.5;

    float luminance = dot(color, vec3(0.299, 0.587, 0.114));
    vec3 saturationColor = mix(vec3(luminance), color, 1.0 + u_saturation);
    vec3 adjusted = saturationColor;

    adjusted.r += u_temperature * 0.05;
    adjusted.b -= u_temperature * 0.05;

    outColor = vec4(adjusted, texColor.a);
  }
`;

export function initWebGLImagePipeline(canvas: HTMLCanvasElement, image: HTMLImageElement) {
  const gl = canvas.getContext('webgl2');
  if (!gl) throw new Error('WebGL 2 not supported');

  // Helper to compile shaders
  function createShader(gl: WebGL2RenderingContext, type: number, source: string) {
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const info = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error(`Shader compilation error: ${info}`);
    }
    return shader;
  }

  const vertShader = createShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
  const fragShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);
  const program = gl.createProgram()!;
  gl.attachShader(program, vertShader);
  gl.attachShader(program, fragShader);
  gl.linkProgram(program);

  // Set up geometry (full-screen quad vertices and texture coordinates)
  const positionBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    -1, -1,  1, -1, -1,  1,
    -1,  1,  1, -1,  1,  1,
  ]), gl.STATIC_DRAW);

  const texCoordBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    0, 1,  1, 1,  0, 0,
    0, 0,  1, 1,  1, 0,
  ]), gl.STATIC_DRAW);

  // Load image into WebGL texture
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);

  // Get uniform locations
  const locs = {
    brightness: gl.getUniformLocation(program, 'u_brightness'),
    contrast: gl.getUniformLocation(program, 'u_contrast'),
    saturation: gl.getUniformLocation(program, 'u_saturation'),
    temperature: gl.getUniformLocation(program, 'u_temperature'),
  };

  // Render function called whenever sliders move
  return function render(settings: { brightness: number; contrast: number; saturation: number; temperature: number }) {
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    gl.viewport(0, 0, canvas.width, canvas.height);

    gl.useProgram(program);

    // Set uniforms (normalizing slider ranges to shader inputs)
    gl.uniform1f(locs.brightness, settings.brightness / 100);
    gl.uniform1f(locs.contrast, settings.contrast / 100);
    gl.uniform1f(locs.saturation, settings.saturation / 100);
    gl.uniform1f(locs.temperature, settings.temperature / 50);

    // Draw call
    const posAttr = gl.getAttribLocation(program, 'a_position');
    gl.enableVertexAttribArray(posAttr);
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.vertexAttribPointer(posAttr, 2, gl.FLOAT, false, 0, 0);

    const texAttr = gl.getAttribLocation(program, 'a_texCoord');
    gl.enableVertexAttribArray(texAttr);
    gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
    gl.vertexAttribPointer(texAttr, 2, gl.FLOAT, false, 0, 0);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
  };
}