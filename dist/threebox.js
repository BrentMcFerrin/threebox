import * as THREE from "three";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
import { MTLLoader } from "three/addons/loaders/MTLLoader.js";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { ColladaLoader } from "three/addons/loaders/ColladaLoader.js";
import { Line2 } from "three/addons/lines/Line2.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import { LineGeometry } from "three/addons/lines/LineGeometry.js";
const WORLD_SIZE = 1024e3;
const FOV_ORTHO = 0.1 / 180 * Math.PI;
const FOV = Math.atan(3 / 4);
const EARTH_RADIUS = 63710088e-1;
const EARTH_CIRCUMFERENCE_EQUATOR = 40075017;
const ThreeboxConstants = {
  WORLD_SIZE,
  PROJECTION_WORLD_SIZE: WORLD_SIZE / (EARTH_RADIUS * Math.PI * 2),
  MERCATOR_A: EARTH_RADIUS,
  DEG2RAD: Math.PI / 180,
  RAD2DEG: 180 / Math.PI,
  EARTH_RADIUS,
  EARTH_CIRCUMFERENCE: 2 * Math.PI * EARTH_RADIUS,
  //40075000, // In meters
  EARTH_CIRCUMFERENCE_EQUATOR,
  FOV_ORTHO,
  // closest to 0
  FOV,
  // Math.atan(3/4) radians. If this value is changed, FOV_DEGREES must be calculated
  FOV_DEGREES: FOV * 180 / Math.PI,
  // Math.atan(3/4) in degrees
  TILE_SIZE: 512
};
function Validate() {
}
Validate.prototype = {
  Coords: function(input) {
    if (input.constructor !== Array) {
      console.error("Coords must be an array");
      return;
    }
    if (input.length < 2) {
      console.error("Coords length must be at least 2");
      return;
    }
    for (const member of input) {
      if (member.constructor !== Number) {
        console.error("Coords values must be numbers");
        return;
      }
    }
    if (Math.abs(input[1]) > 90) {
      console.error("Latitude must be between -90 and 90");
      return;
    }
    return input;
  },
  Line: function(input) {
    var scope = this;
    if (input.constructor !== Array) {
      console.error("Line must be an array");
      return;
    }
    for (const coord of input) {
      if (!scope.Coords(coord)) {
        console.error("Each coordinate in a line must be a valid Coords type");
        return;
      }
    }
    return input;
  },
  Rotation: function(input) {
    if (input.constructor === Number) input = { z: input };
    else if (input.constructor === Object) {
      for (const key of Object.keys(input)) {
        if (!["x", "y", "z"].includes(key)) {
          console.error("Rotation parameters must be x, y, or z");
          return;
        }
        if (input[key].constructor !== Number) {
          console.error("Individual rotation values must be numbers");
          return;
        }
      }
    } else {
      console.error("Rotation must be an object or a number");
      return;
    }
    return input;
  },
  Scale: function(input) {
    if (input.constructor === Number) {
      input = { x: input, y: input, z: input };
    } else if (input.constructor === Object) {
      for (const key of Object.keys(input)) {
        if (!["x", "y", "z"].includes(key)) {
          console.error("Scale parameters must be x, y, or z");
          return;
        }
        if (input[key].constructor !== Number) {
          console.error("Individual scale values must be numbers");
          return;
        }
      }
    } else {
      console.error("Scale must be an object or a number");
      return;
    }
    return input;
  }
};
var utils = {
  prettyPrintMatrix: function(uglymatrix) {
    for (var s = 0; s < 4; s++) {
      var quartet = [
        uglymatrix[s],
        uglymatrix[s + 4],
        uglymatrix[s + 8],
        uglymatrix[s + 12]
      ];
      console.log(quartet.map(function(num) {
        return num.toFixed(4);
      }));
    }
  },
  makePerspectiveMatrix: function(fovy, aspect, near, far) {
    var out = new THREE.Matrix4();
    var f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
    var newMatrix = [
      f / aspect,
      0,
      0,
      0,
      0,
      f,
      0,
      0,
      0,
      0,
      (far + near) * nf,
      -1,
      0,
      0,
      2 * far * near * nf,
      0
    ];
    out.elements = newMatrix;
    return out;
  },
  //[jscastro] new orthographic matrix calculations https://en.wikipedia.org/wiki/Orthographic_projection and validated with https://bit.ly/3rPvB9Y
  makeOrthographicMatrix: function(left, right, top, bottom, near, far) {
    var out = new THREE.Matrix4();
    const w = 1 / (right - left);
    const h = 1 / (top - bottom);
    const p = 1 / (far - near);
    const x = (right + left) * w;
    const y = (top + bottom) * h;
    const z = near * p;
    var newMatrix = [
      2 * w,
      0,
      0,
      0,
      0,
      2 * h,
      0,
      0,
      0,
      0,
      -1 * p,
      0,
      -x,
      -y,
      -z,
      1
    ];
    out.elements = newMatrix;
    return out;
  },
  //gimme radians
  radify: function(deg) {
    function convert(degrees) {
      degrees = degrees || 0;
      return Math.PI * 2 * degrees / 360;
    }
    if (typeof deg === "object") {
      if (deg.length > 0) {
        return deg.map(function(degree) {
          return convert(degree);
        });
      } else {
        return [convert(deg.x), convert(deg.y), convert(deg.z)];
      }
    } else return convert(deg);
  },
  //gimme degrees
  degreeify: function(rad2) {
    function convert(radians) {
      radians = radians || 0;
      return radians * 360 / (Math.PI * 2);
    }
    if (typeof rad2 === "object") {
      return [convert(rad2.x), convert(rad2.y), convert(rad2.z)];
    } else return convert(rad2);
  },
  projectToWorld: function(coords) {
    var projected = [
      -ThreeboxConstants.MERCATOR_A * ThreeboxConstants.DEG2RAD * coords[0] * ThreeboxConstants.PROJECTION_WORLD_SIZE,
      -ThreeboxConstants.MERCATOR_A * Math.log(Math.tan(Math.PI * 0.25 + 0.5 * ThreeboxConstants.DEG2RAD * coords[1])) * ThreeboxConstants.PROJECTION_WORLD_SIZE
    ];
    if (!coords[2]) projected.push(0);
    else {
      var pixelsPerMeter = this.projectedUnitsPerMeter(coords[1]);
      projected.push(coords[2] * pixelsPerMeter);
    }
    var result = new THREE.Vector3(projected[0], projected[1], projected[2]);
    return result;
  },
  projectedUnitsPerMeter: function(latitude) {
    return Math.abs(ThreeboxConstants.WORLD_SIZE / Math.cos(ThreeboxConstants.DEG2RAD * latitude) / ThreeboxConstants.EARTH_CIRCUMFERENCE);
  },
  _circumferenceAtLatitude: function(latitude) {
    return ThreeboxConstants.EARTH_CIRCUMFERENCE * Math.cos(latitude * Math.PI / 180);
  },
  mercatorZfromAltitude: function(altitude2, lat) {
    return altitude2 / this._circumferenceAtLatitude(lat);
  },
  _scaleVerticesToMeters: function(centerLatLng, vertices) {
    var pixelsPerMeter = this.projectedUnitsPerMeter(centerLatLng[1]);
    this.projectToWorld(centerLatLng);
    for (var i = 0; i < vertices.length; i++) {
      vertices[i].multiplyScalar(pixelsPerMeter);
    }
    return vertices;
  },
  projectToScreen: function(coords) {
    console.log("WARNING: Projecting to screen coordinates is not yet implemented");
  },
  unprojectFromScreen: function(pixel) {
    console.log("WARNING: unproject is not yet implemented");
  },
  //world units to lnglat
  unprojectFromWorld: function(worldUnits) {
    var unprojected = [
      -worldUnits.x / (ThreeboxConstants.MERCATOR_A * ThreeboxConstants.DEG2RAD * ThreeboxConstants.PROJECTION_WORLD_SIZE),
      2 * (Math.atan(Math.exp(worldUnits.y / (ThreeboxConstants.PROJECTION_WORLD_SIZE * -ThreeboxConstants.MERCATOR_A))) - Math.PI / 4) / ThreeboxConstants.DEG2RAD
    ];
    var pixelsPerMeter = this.projectedUnitsPerMeter(unprojected[1]);
    var height = worldUnits.z || 0;
    unprojected.push(height / pixelsPerMeter);
    return unprojected;
  },
  toScreenPosition: function(obj, camera) {
    var vector = new THREE.Vector3();
    var widthHalf = 0.5 * renderer.context.canvas.width;
    var heightHalf = 0.5 * renderer.context.canvas.height;
    obj.updateMatrixWorld();
    vector.setFromMatrixPosition(obj.matrixWorld);
    vector.project(camera);
    vector.x = vector.x * widthHalf + widthHalf;
    vector.y = -(vector.y * heightHalf) + heightHalf;
    return {
      x: vector.x,
      y: vector.y
    };
  },
  //get the center point of a feature
  getFeatureCenter: function getFeatureCenter(feature, model, level) {
    let center = [];
    let latitude = 0;
    let longitude = 0;
    let height = 0;
    let coordinates = [...feature.geometry.coordinates[0]];
    if (feature.geometry.type === "Point") {
      center = [...coordinates[0]];
    } else {
      if (feature.geometry.type === "MultiPolygon") coordinates = coordinates[0];
      coordinates.splice(-1, 1);
      coordinates.forEach(function(c) {
        latitude += c[0];
        longitude += c[1];
      });
      center = [latitude / coordinates.length, longitude / coordinates.length];
    }
    height = this.getObjectHeightOnFloor(feature, model, level);
    center.length < 3 ? center.push(height) : center[2] = height;
    return center;
  },
  getObjectHeightOnFloor: function(feature, obj, level = feature.properties.level || 0) {
    let floorHeightMin = level * (feature.properties.levelHeight || 0);
    let base = feature.properties.base_height || feature.properties.min_height || 0;
    let height = obj && obj.model ? 0 : feature.properties.height - base;
    let objectHeight = height + base;
    let modelHeightFloor = floorHeightMin + objectHeight;
    return modelHeightFloor;
  },
  _flipMaterialSides: function(obj) {
  },
  // to improve precision, normalize a series of vector3's to their collective center, and move the resultant mesh to that center
  normalizeVertices(vertices) {
    let geometry = new THREE.BufferGeometry();
    let positions = [];
    for (var j = 0; j < vertices.length; j++) {
      let p = vertices[j];
      positions.push(p.x, p.y, p.z);
      positions.push(p.x, p.y, p.z);
    }
    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(positions), 3));
    geometry.computeBoundingSphere();
    var center = geometry.boundingSphere.center;
    var scaled = vertices.map(function(v3) {
      var normalized = v3.sub(center);
      return normalized;
    });
    return { vertices: scaled, position: center };
  },
  //flatten an array of Vector3's into a shallow array of values in x-y-z order, for bufferGeometry
  flattenVectors(vectors) {
    var flattenedArray = [];
    for (let vertex of vectors) {
      flattenedArray.push(vertex.x, vertex.y, vertex.z);
    }
    return flattenedArray;
  },
  //convert a line/polygon to Vector3's
  lnglatsToWorld: function(coords) {
    var vector3 = coords.map(
      function(pt) {
        var p = utils.projectToWorld(pt);
        var v3 = new THREE.Vector3(p.x, p.y, p.z);
        return v3;
      }
    );
    return vector3;
  },
  extend: function(original, addition) {
    for (let key in addition) original[key] = addition[key];
  },
  clone: function(original) {
    var clone = {};
    for (let key in original) clone[key] = original[key];
    return clone;
  },
  clamp: function(n, min, max) {
    return Math.min(max, Math.max(min, n));
  },
  // retrieve object parameters from an options object
  types: {
    rotation: function(r, currentRotation) {
      if (!r) {
        r = 0;
      }
      if (typeof r === "number") r = { z: r };
      var degrees = this.applyDefault([r.x, r.y, r.z], currentRotation);
      var radians = utils.radify(degrees);
      return radians;
    },
    scale: function(s, currentScale) {
      if (!s) {
        s = 1;
      }
      if (typeof s === "number") return s = [s, s, s];
      else return this.applyDefault([s.x, s.y, s.z], currentScale);
    },
    applyDefault: function(array, current) {
      var output = array.map(function(item, index) {
        item = item || current[index];
        return item;
      });
      return output;
    }
  },
  toDecimal: function(n, d) {
    return Number(n.toFixed(d));
  },
  equal: function(obj1, obj2) {
    const keys1 = Object.keys(obj1);
    const keys2 = Object.keys(obj2);
    if (keys1.length !== keys2.length) {
      return false;
    }
    if (keys1.length == 0 && keys2.length == 0 && keys1 !== keys2) {
      return false;
    }
    for (const key of keys1) {
      const val1 = obj1[key];
      const val2 = obj2[key];
      const areObjects = this.isObject(val1) && this.isObject(val2);
      if (areObjects && !equal(val1, val2) || !areObjects && val1 !== val2) {
        return false;
      }
    }
    return true;
  },
  isObject: function(object) {
    return object != null && typeof object === "object";
  },
  curveToLine: (curve, params) => {
    let { width, color } = params;
    let geometry = new THREE.BufferGeometry().setFromPoints(
      curve.getPoints(100)
    );
    let material2 = new THREE.LineBasicMaterial({
      color,
      linewidth: width
    });
    let line2 = new THREE.Line(geometry, material2);
    return line2;
  },
  curvesToLines: (curves) => {
    var colors = [16711680, 2031360, 2490623];
    var lines = curves.map((curve, i) => {
      let params = {
        width: 3,
        color: colors[i] || "purple"
      };
      let curveline = curveToLine(curve, params);
      return curveline;
    });
    return lines;
  },
  _validate: function(userInputs, defaults2) {
    userInputs = userInputs || {};
    var validatedOutput = {};
    utils.extend(validatedOutput, userInputs);
    for (let key of Object.keys(defaults2)) {
      if (userInputs[key] === void 0) {
        if (defaults2[key] === null) {
          console.error(key + " is required");
          return;
        } else validatedOutput[key] = defaults2[key];
      } else validatedOutput[key] = userInputs[key];
    }
    return validatedOutput;
  },
  Validator: new Validate(),
  exposedMethods: ["projectToWorld", "projectedUnitsPerMeter", "extend", "unprojectFromWorld"]
};
function CameraSync(map, camera, world) {
  this.map = map;
  this.camera = camera;
  this.active = true;
  this.camera.matrixAutoUpdate = false;
  this.world = world || new THREE.Group();
  this.world.position.x = this.world.position.y = ThreeboxConstants.WORLD_SIZE / 2;
  this.world.matrixAutoUpdate = false;
  this.state = {
    translateCenter: new THREE.Matrix4().makeTranslation(ThreeboxConstants.WORLD_SIZE / 2, -ThreeboxConstants.WORLD_SIZE / 2, 0),
    worldSizeRatio: ThreeboxConstants.TILE_SIZE / ThreeboxConstants.WORLD_SIZE,
    worldSize: ThreeboxConstants.TILE_SIZE * this.map.transform.scale
  };
  let _this = this;
  this.map.on("move", function() {
    _this.updateCamera();
  }).on("resize", function() {
    _this.setupCamera();
  });
  this.setupCamera();
}
CameraSync.prototype = {
  setupCamera: function() {
    const t = this.map.transform;
    this.camera.aspect = t.width / t.height;
    this.halfFov = t._fov / 2;
    this.cameraToCenterDistance = 0.5 / Math.tan(this.halfFov) * t.height;
    const maxPitch = t._maxPitch * Math.PI / 180;
    this.acuteAngle = Math.PI / 2 - maxPitch;
    this.updateCamera();
  },
  updateCamera: function(ev) {
    if (!this.camera) {
      console.log("nocamera");
      return;
    }
    const t = this.map.transform;
    this.camera.aspect = t.width / t.height;
    const offset = t.centerOffset || new THREE.Vector3();
    let farZ = 0;
    let furthestDistance = 0;
    this.halfFov = t._fov / 2;
    const groundAngle = Math.PI / 2 + t._pitch;
    const pitchAngle = Math.cos(Math.PI / 2 - t._pitch);
    this.cameraToCenterDistance = 0.5 / Math.tan(this.halfFov) * t.height;
    let pixelsPerMeter = 1;
    const worldSize = this.worldSize();
    if (this.map.tb.mapboxVersion >= 2) {
      pixelsPerMeter = this.mercatorZfromAltitude(1, t.center.lat) * worldSize;
      const fovAboveCenter = t._fov * (0.5 + t.centerOffset.y / t.height);
      const minElevationInPixels = t.elevation ? t.elevation.getMinElevationBelowMSL() * pixelsPerMeter : 0;
      const cameraToSeaLevelDistance = (t._camera.position[2] * worldSize - minElevationInPixels) / Math.cos(t._pitch);
      const topHalfSurfaceDistance = Math.sin(fovAboveCenter) * cameraToSeaLevelDistance / Math.sin(utils.clamp(Math.PI - groundAngle - fovAboveCenter, 0.01, Math.PI - 0.01));
      furthestDistance = pitchAngle * topHalfSurfaceDistance + cameraToSeaLevelDistance;
      const horizonDistance = cameraToSeaLevelDistance * (1 / t._horizonShift);
      farZ = Math.min(furthestDistance * 1.01, horizonDistance);
    } else {
      const topHalfSurfaceDistance = Math.sin(this.halfFov) * this.cameraToCenterDistance / Math.sin(Math.PI - groundAngle - this.halfFov);
      furthestDistance = pitchAngle * topHalfSurfaceDistance + this.cameraToCenterDistance;
      farZ = furthestDistance * 1.01;
    }
    this.cameraTranslateZ = new THREE.Matrix4().makeTranslation(0, 0, this.cameraToCenterDistance);
    const nz = t.height / 50;
    let nearZ = Math.max(nz * pitchAngle, nz);
    const h = t.height;
    const w = t.width;
    if (this.camera instanceof THREE.OrthographicCamera) {
      this.camera.projectionMatrix = utils.makeOrthographicMatrix(w / -2, w / 2, h / 2, h / -2, nearZ, farZ);
    } else {
      this.camera.projectionMatrix = utils.makePerspectiveMatrix(t._fov, w / h, nearZ, farZ);
    }
    this.camera.projectionMatrix.elements[8] = -offset.x * 2 / t.width;
    this.camera.projectionMatrix.elements[9] = offset.y * 2 / t.height;
    let cameraWorldMatrix = this.calcCameraMatrix(t._pitch, t.angle);
    if (t.elevation) cameraWorldMatrix.elements[14] = t._camera.position[2] * worldSize;
    this.camera.matrixWorld.copy(cameraWorldMatrix);
    let zoomPow = t.scale * this.state.worldSizeRatio;
    let scale = new THREE.Matrix4();
    let translateMap = new THREE.Matrix4();
    let rotateMap = new THREE.Matrix4();
    scale.makeScale(zoomPow, zoomPow, zoomPow);
    let x = t.x || t.point.x;
    let y = t.y || t.point.y;
    translateMap.makeTranslation(-x, y, 0);
    rotateMap.makeRotationZ(Math.PI);
    this.world.matrix = new THREE.Matrix4().premultiply(rotateMap).premultiply(this.state.translateCenter).premultiply(scale).premultiply(translateMap);
    this.map.fire("CameraSynced", { detail: { nearZ, farZ, pitch: t._pitch, angle: t.angle, furthestDistance, cameraToCenterDistance: this.cameraToCenterDistance, t: this.map.transform, tbProjMatrix: this.camera.projectionMatrix.elements, tbWorldMatrix: this.world.matrix.elements, cameraSyn: CameraSync } });
  },
  worldSize() {
    let t = this.map.transform;
    return t.tileSize * t.scale;
  },
  worldSizeFromZoom() {
    let t = this.map.transform;
    return Math.pow(2, t.zoom) * t.tileSize;
  },
  mercatorZfromAltitude(altitude2, lat) {
    return altitude2 / this.circumferenceAtLatitude(lat);
  },
  mercatorZfromZoom() {
    return this.cameraToCenterDistance / this.worldSizeFromZoom();
  },
  circumferenceAtLatitude(latitude) {
    return ThreeboxConstants.EARTH_CIRCUMFERENCE * Math.cos(latitude * Math.PI / 180);
  },
  calcCameraMatrix(pitch, angle, trz) {
    const t = this.map.transform;
    const _pitch = pitch === void 0 ? t._pitch : pitch;
    const _angle = angle === void 0 ? t.angle : angle;
    const _trz = trz === void 0 ? this.cameraTranslateZ : trz;
    return new THREE.Matrix4().premultiply(_trz).premultiply(new THREE.Matrix4().makeRotationX(_pitch)).premultiply(new THREE.Matrix4().makeRotationZ(_angle));
  },
  updateCameraState() {
    let t = this.map.transform;
    if (!t.height) return;
    const dir = t._camera.forward();
    const distance = t.cameraToCenterDistance;
    const center = t.point;
    t._cameraZoom ? t._cameraZoom : t._zoom;
    const altitude2 = this.mercatorZfromZoom(t);
    const height = altitude2 - this.mercatorZfromAltitude(t._centerAltitude, t.center.lat);
    const updatedWorldSize = t.cameraToCenterDistance / height;
    return [
      center.x / this.worldSize() - dir[0] * distance / updatedWorldSize,
      center.y / this.worldSize() - dir[1] * distance / updatedWorldSize,
      this.mercatorZfromAltitude(t._centerAltitude, t._center.lat) + -dir[2] * distance / updatedWorldSize
    ];
  },
  getWorldToCamera(worldSize, pixelsPerMeter) {
    let t = this.map.transform;
    const matrix = new THREE.Matrix4();
    const matrixT = new THREE.Matrix4();
    const o2 = t._camera._orientation;
    const p = t._camera.position;
    const invPosition = new THREE.Vector3(p[0], p[1], p[2]);
    const quat = new THREE.Quaternion();
    quat.set(o2[0], o2[1], o2[2], o2[3]);
    const invOrientation = quat.conjugate();
    invPosition.multiplyScalar(-worldSize);
    matrixT.makeTranslation(invPosition.x, invPosition.y, invPosition.z);
    matrix.makeRotationFromQuaternion(invOrientation).premultiply(matrixT);
    matrix.elements[1] *= -1;
    matrix.elements[5] *= -1;
    matrix.elements[9] *= -1;
    matrix.elements[13] *= -1;
    matrix.elements[8] *= pixelsPerMeter;
    matrix.elements[9] *= pixelsPerMeter;
    matrix.elements[10] *= pixelsPerMeter;
    matrix.elements[11] *= pixelsPerMeter;
    return matrix;
  },
  translate(out, a, v) {
    let x = v[0] || v.x, y = v[1] || v.y, z = v[2] || v.z;
    let a00, a01, a02, a03;
    let a10, a11, a12, a13;
    let a20, a21, a22, a23;
    if (a === out) {
      out[12] = a[0] * x + a[4] * y + a[8] * z + a[12];
      out[13] = a[1] * x + a[5] * y + a[9] * z + a[13];
      out[14] = a[2] * x + a[6] * y + a[10] * z + a[14];
      out[15] = a[3] * x + a[7] * y + a[11] * z + a[15];
    } else {
      a00 = a[0];
      a01 = a[1];
      a02 = a[2];
      a03 = a[3];
      a10 = a[4];
      a11 = a[5];
      a12 = a[6];
      a13 = a[7];
      a20 = a[8];
      a21 = a[9];
      a22 = a[10];
      a23 = a[11];
      out[0] = a00;
      out[1] = a01;
      out[2] = a02;
      out[3] = a03;
      out[4] = a10;
      out[5] = a11;
      out[6] = a12;
      out[7] = a13;
      out[8] = a20;
      out[9] = a21;
      out[10] = a22;
      out[11] = a23;
      out[12] = a00 * x + a10 * y + a20 * z + a[12];
      out[13] = a01 * x + a11 * y + a21 * z + a[13];
      out[14] = a02 * x + a12 * y + a22 * z + a[14];
      out[15] = a03 * x + a13 * y + a23 * z + a[15];
    }
    return out;
  }
};
var PI = Math.PI, sin = Math.sin, cos = Math.cos, tan = Math.tan, asin = Math.asin, atan = Math.atan2, acos = Math.acos, rad = PI / 180;
var dayMs = 1e3 * 60 * 60 * 24, J1970 = 2440588, J2000 = 2451545;
function toJulian(date) {
  return date.valueOf() / dayMs - 0.5 + J1970;
}
function fromJulian(j) {
  return new Date((j + 0.5 - J1970) * dayMs);
}
function toDays(date) {
  return toJulian(date) - J2000;
}
var e = rad * 23.4397;
function rightAscension(l, b) {
  return atan(sin(l) * cos(e) - tan(b) * sin(e), cos(l));
}
function declination(l, b) {
  return asin(sin(b) * cos(e) + cos(b) * sin(e) * sin(l));
}
function azimuth(H, phi, dec) {
  return atan(sin(H), cos(H) * sin(phi) - tan(dec) * cos(phi));
}
function altitude(H, phi, dec) {
  return asin(sin(phi) * sin(dec) + cos(phi) * cos(dec) * cos(H));
}
function siderealTime(d, lw) {
  return rad * (280.16 + 360.9856235 * d) - lw;
}
function astroRefraction(h) {
  if (h < 0)
    h = 0;
  return 2967e-7 / Math.tan(h + 312536e-8 / (h + 0.08901179));
}
function solarMeanAnomaly(d) {
  return rad * (357.5291 + 0.98560028 * d);
}
function eclipticLongitude(M) {
  var C = rad * (1.9148 * sin(M) + 0.02 * sin(2 * M) + 3e-4 * sin(3 * M)), P = rad * 102.9372;
  return M + C + P + PI;
}
function sunCoords(d) {
  var M = solarMeanAnomaly(d), L = eclipticLongitude(M);
  return {
    dec: declination(L, 0),
    ra: rightAscension(L, 0)
  };
}
var SunCalc = {};
SunCalc.getPosition = function(date, lat, lng) {
  var lw = rad * -lng, phi = rad * lat, d = toDays(date), c = sunCoords(d), H = siderealTime(d, lw) - c.ra;
  return {
    azimuth: azimuth(H, phi, c.dec),
    altitude: altitude(H, phi, c.dec)
  };
};
SunCalc.toJulian = function(date) {
  return toJulian(date);
};
var times = SunCalc.times = [
  [-0.833, "sunrise", "sunset"],
  [-0.3, "sunriseEnd", "sunsetStart"],
  [-6, "dawn", "dusk"],
  [-12, "nauticalDawn", "nauticalDusk"],
  [-18, "nightEnd", "night"],
  [6, "goldenHourEnd", "goldenHour"]
];
SunCalc.addTime = function(angle, riseName, setName) {
  times.push([angle, riseName, setName]);
};
var J0 = 9e-4;
function julianCycle(d, lw) {
  return Math.round(d - J0 - lw / (2 * PI));
}
function approxTransit(Ht, lw, n) {
  return J0 + (Ht + lw) / (2 * PI) + n;
}
function solarTransitJ(ds, M, L) {
  return J2000 + ds + 53e-4 * sin(M) - 69e-4 * sin(2 * L);
}
function hourAngle(h, phi, d) {
  return acos((sin(h) - sin(phi) * sin(d)) / (cos(phi) * cos(d)));
}
function observerAngle(height) {
  return -2.076 * Math.sqrt(height) / 60;
}
function getSetJ(h, lw, phi, dec, n, M, L) {
  var w = hourAngle(h, phi, dec), a = approxTransit(w, lw, n);
  return solarTransitJ(a, M, L);
}
SunCalc.getTimes = function(date, lat, lng, height) {
  height = height || 0;
  var lw = rad * -lng, phi = rad * lat, dh = observerAngle(height), d = toDays(date), n = julianCycle(d, lw), ds = approxTransit(0, lw, n), M = solarMeanAnomaly(ds), L = eclipticLongitude(M), dec = declination(L, 0), Jnoon = solarTransitJ(ds, M, L), i, len, time, h0, Jset, Jrise;
  var result = {
    solarNoon: fromJulian(Jnoon),
    nadir: fromJulian(Jnoon - 0.5)
  };
  for (i = 0, len = times.length; i < len; i += 1) {
    time = times[i];
    h0 = (time[0] + dh) * rad;
    Jset = getSetJ(h0, lw, phi, dec, n, M, L);
    Jrise = Jnoon - (Jset - Jnoon);
    result[time[1]] = fromJulian(Jrise);
    result[time[2]] = fromJulian(Jset);
  }
  return result;
};
function moonCoords(d) {
  var L = rad * (218.316 + 13.176396 * d), M = rad * (134.963 + 13.064993 * d), F = rad * (93.272 + 13.22935 * d), l = L + rad * 6.289 * sin(M), b = rad * 5.128 * sin(F), dt = 385001 - 20905 * cos(M);
  return {
    ra: rightAscension(l, b),
    dec: declination(l, b),
    dist: dt
  };
}
SunCalc.getMoonPosition = function(date, lat, lng) {
  var lw = rad * -lng, phi = rad * lat, d = toDays(date), c = moonCoords(d), H = siderealTime(d, lw) - c.ra, h = altitude(H, phi, c.dec), pa = atan(sin(H), tan(phi) * cos(c.dec) - sin(c.dec) * cos(H));
  h = h + astroRefraction(h);
  return {
    azimuth: azimuth(H, phi, c.dec),
    altitude: h,
    distance: c.dist,
    parallacticAngle: pa
  };
};
SunCalc.getMoonIllumination = function(date) {
  var d = toDays(date || /* @__PURE__ */ new Date()), s = sunCoords(d), m = moonCoords(d), sdist = 149598e3, phi = acos(sin(s.dec) * sin(m.dec) + cos(s.dec) * cos(m.dec) * cos(s.ra - m.ra)), inc = atan(sdist * sin(phi), m.dist - sdist * cos(phi)), angle = atan(cos(s.dec) * sin(s.ra - m.ra), sin(s.dec) * cos(m.dec) - cos(s.dec) * sin(m.dec) * cos(s.ra - m.ra));
  return {
    fraction: (1 + cos(inc)) / 2,
    phase: 0.5 + 0.5 * inc * (angle < 0 ? -1 : 1) / Math.PI,
    angle
  };
};
function hoursLater(date, h) {
  return new Date(date.valueOf() + h * dayMs / 24);
}
SunCalc.getMoonTimes = function(date, lat, lng, inUTC) {
  var t = new Date(date);
  if (inUTC) t.setUTCHours(0, 0, 0, 0);
  else t.setHours(0, 0, 0, 0);
  var hc = 0.133 * rad, h0 = SunCalc.getMoonPosition(t, lat, lng).altitude - hc, h1, h2, rise, set, a, b, xe, ye, d, roots, x1, x2, dx;
  for (var i = 1; i <= 24; i += 2) {
    h1 = SunCalc.getMoonPosition(hoursLater(t, i), lat, lng).altitude - hc;
    h2 = SunCalc.getMoonPosition(hoursLater(t, i + 1), lat, lng).altitude - hc;
    a = (h0 + h2) / 2 - h1;
    b = (h2 - h0) / 2;
    xe = -b / (2 * a);
    ye = (a * xe + b) * xe + h1;
    d = b * b - 4 * a * h1;
    roots = 0;
    if (d >= 0) {
      dx = Math.sqrt(d) / (Math.abs(a) * 2);
      x1 = xe - dx;
      x2 = xe + dx;
      if (Math.abs(x1) <= 1) roots++;
      if (Math.abs(x2) <= 1) roots++;
      if (x1 < -1) x1 = x2;
    }
    if (roots === 1) {
      if (h0 < 0) rise = i + x1;
      else set = i + x1;
    } else if (roots === 2) {
      rise = i + (ye < 0 ? x2 : x1);
      set = i + (ye < 0 ? x1 : x2);
    }
    if (rise && set) break;
    h0 = h2;
  }
  var result = {};
  if (rise) result.rise = hoursLater(t, rise);
  if (set) result.set = hoursLater(t, set);
  if (!rise && !set) result[ye > 0 ? "alwaysUp" : "alwaysDown"] = true;
  return result;
};
var defaults$1 = {
  material: "MeshBasicMaterial",
  color: "black",
  opacity: 1
};
function material(options2) {
  var output;
  if (options2) {
    options2 = utils._validate(options2, defaults$1);
    if (options2.material && options2.material.isMaterial) output = options2.material;
    else if (options2.material || options2.color || options2.opacity) {
      output = new THREE[options2.material]({ color: options2.color, transparent: options2.opacity < 1 });
    } else output = generateDefaultMaterial();
    output.opacity = options2.opacity;
    if (options2.side) output.side = options2.side;
  } else output = generateDefaultMaterial();
  function generateDefaultMaterial() {
    return new THREE[defaults$1.material]({ color: defaults$1.color });
  }
  return output;
}
function AnimationManager(map) {
  this.map = map;
  this.enrolledObjects = [];
  this.previousFrameTime;
}
AnimationManager.prototype = {
  unenroll: function(obj) {
    this.enrolledObjects.splice(this.enrolledObjects.indexOf(obj), 1);
  },
  enroll: function(obj) {
    obj.clock = new THREE.Clock();
    obj.hasDefaultAnimation = false;
    obj.defaultAction;
    obj.actions = [];
    obj.mixer;
    if (obj.animations && obj.animations.length > 0) {
      obj.hasDefaultAnimation = true;
      let daIndex = obj.userData.defaultAnimation ? obj.userData.defaultAnimation : 0;
      obj.mixer = new THREE.AnimationMixer(obj);
      setAction(daIndex);
    }
    function setAction(animationIndex) {
      for (let i = 0; i < obj.animations.length; i++) {
        if (animationIndex > obj.animations.length)
          console.log("The animation index " + animationIndex + " doesn't exist for this object");
        let animation = obj.animations[i];
        let action = obj.mixer.clipAction(animation);
        obj.actions.push(action);
        if (animationIndex === i) {
          obj.defaultAction = action;
          action.setEffectiveWeight(1);
        } else {
          action.setEffectiveWeight(0);
        }
        action.play();
      }
    }
    let _isPlaying = false;
    Object.defineProperty(obj, "isPlaying", {
      get() {
        return _isPlaying;
      },
      set(value) {
        if (_isPlaying != value) {
          _isPlaying = value;
          obj.dispatchEvent({ type: "IsPlayingChanged", detail: obj });
        }
      }
    });
    this.enrolledObjects.push(obj);
    obj.animationQueue = [];
    obj.set = function(options2) {
      if (options2.duration > 0) {
        let newParams = {
          start: Date.now(),
          expiration: Date.now() + options2.duration,
          endState: {}
        };
        utils.extend(options2, newParams);
        let translating = options2.coords;
        let rotating = options2.rotation;
        let scaling = options2.scale || options2.scaleX || options2.scaleY || options2.scaleZ;
        if (rotating) {
          let r = obj.rotation;
          options2.startRotation = [r.x, r.y, r.z];
          options2.endState.rotation = utils.types.rotation(options2.rotation, options2.startRotation);
          options2.rotationPerMs = options2.endState.rotation.map(function(angle, index) {
            return (angle - options2.startRotation[index]) / options2.duration;
          });
        }
        if (scaling) {
          let s = obj.scale;
          options2.startScale = [s.x, s.y, s.z];
          options2.endState.scale = utils.types.scale(options2.scale, options2.startScale);
          options2.scalePerMs = options2.endState.scale.map(function(scale, index) {
            return (scale - options2.startScale[index]) / options2.duration;
          });
        }
        if (translating) options2.pathCurve = new THREE.CatmullRomCurve3(utils.lnglatsToWorld([obj.coordinates, options2.coords]));
        let entry = {
          type: "set",
          parameters: options2
        };
        this.animationQueue.push(entry);
        this.threebox.map.repaint = true;
      } else {
        this.stop();
        options2.rotation = utils.radify(options2.rotation);
        this._setObject(options2);
      }
      return this;
    };
    obj.animationMethod = null;
    obj.stop = function(index) {
      if (obj.mixer) {
        obj.isPlaying = false;
        cancelAnimationFrame(obj.animationMethod);
      }
      this.animationQueue = [];
      return this;
    };
    obj.followPath = function(options2, cb) {
      let entry = {
        type: "followPath",
        parameters: utils._validate(options2, defaults.followPath)
      };
      utils.extend(
        entry.parameters,
        {
          pathCurve: new THREE.CatmullRomCurve3(
            utils.lnglatsToWorld(options2.path)
          ),
          start: Date.now(),
          expiration: Date.now() + entry.parameters.duration,
          cb
        }
      );
      this.animationQueue.push(entry);
      this.threebox.map.repaint = true;
      return this;
    };
    obj._setObject = function(options2) {
      obj.setScale();
      let p = options2.position;
      let r = options2.rotation;
      let s = options2.scale;
      let w = options2.worldCoordinates;
      let q = options2.quaternion;
      let t = options2.translate;
      let wt = options2.worldTranslate;
      if (p) {
        this.coordinates = p;
        let c = utils.projectToWorld(p);
        this.position.copy(c);
      }
      if (t) {
        this.coordinates = [this.coordinates[0] + t[0], this.coordinates[1] + t[1], this.coordinates[2] + t[2]];
        let c = utils.projectToWorld(t);
        this.position.copy(c);
        options2.position = this.coordinates;
      }
      if (wt) {
        this.translateX(wt.x);
        this.translateY(wt.y);
        this.translateZ(wt.z);
        let p2 = utils.unprojectFromWorld(this.position);
        this.coordinates = options2.position = p2;
      }
      if (r) {
        this.rotation.set(r[0], r[1], r[2]);
        options2.rotation = new THREE.Vector3(r[0], r[1], r[2]);
      }
      if (s) {
        this.scale.set(s[0], s[1], s[2]);
        options2.scale = this.scale;
      }
      if (q) {
        this.quaternion.setFromAxisAngle(q[0], q[1]);
        options2.rotation = q[0].multiplyScalar(q[1]);
      }
      if (w) {
        this.position.copy(w);
        let p2 = utils.unprojectFromWorld(w);
        this.coordinates = options2.position = p2;
      }
      this.setBoundingBoxShadowFloor();
      this.setReceiveShadowFloor();
      this.updateMatrixWorld();
      this.threebox.map.repaint = true;
      let e2 = { type: "ObjectChanged", detail: { object: this, action: { position: options2.position, rotation: options2.rotation, scale: options2.scale } } };
      this.dispatchEvent(e2);
    };
    obj.playDefault = function(options2) {
      if (obj.mixer && obj.hasDefaultAnimation) {
        let newParams = {
          start: Date.now(),
          expiration: Date.now() + options2.duration,
          endState: {}
        };
        utils.extend(options2, newParams);
        obj.mixer.timeScale = options2.speed || 1;
        let entry = {
          type: "playDefault",
          parameters: options2
        };
        this.animationQueue.push(entry);
        this.threebox.map.repaint = true;
        return this;
      }
    };
    obj.playAnimation = function(options2) {
      if (obj.mixer) {
        if (options2.animation) {
          setAction(options2.animation);
        }
        obj.playDefault(options2);
      }
    };
    obj.pauseAllActions = function() {
      if (obj.mixer) {
        obj.actions.forEach(function(action) {
          action.paused = true;
        });
      }
    };
    obj.unPauseAllActions = function() {
      if (obj.mixer) {
        obj.actions.forEach(function(action) {
          action.paused = false;
        });
      }
    };
    obj.deactivateAllActions = function() {
      if (obj.mixer) {
        obj.actions.forEach(function(action) {
          action.stop();
        });
      }
    };
    obj.activateAllActions = function() {
      if (obj.mixer) {
        obj.actions.forEach(function(action) {
          action.play();
        });
      }
    };
    obj.idle = function() {
      if (obj.mixer) {
        obj.mixer.update(0.01);
      }
      this.threebox.map.repaint = true;
      return this;
    };
  },
  update: function(now) {
    if (this.previousFrameTime === void 0) this.previousFrameTime = now;
    if (!this.enrolledObjects) return false;
    for (let a = this.enrolledObjects.length - 1; a >= 0; a--) {
      let object = this.enrolledObjects[a];
      if (!object.animationQueue || object.animationQueue.length === 0) continue;
      for (let i = object.animationQueue.length - 1; i >= 0; i--) {
        let item = object.animationQueue[i];
        if (!item) continue;
        let options2 = item.parameters;
        if (!options2.expiration) {
          object.animationQueue.splice(i, 1);
          if (object.animationQueue[i]) object.animationQueue[i].parameters.start = now;
          return;
        }
        let expiring = now >= options2.expiration;
        if (expiring) {
          options2.expiration = false;
          if (item.type === "playDefault") {
            object.stop();
          } else {
            if (options2.endState) object._setObject(options2.endState);
            if (typeof options2.cb != "undefined") options2.cb();
          }
        } else {
          let timeProgress = (now - options2.start) / options2.duration;
          if (item.type === "set") {
            let objectState = {};
            if (options2.pathCurve) objectState.worldCoordinates = options2.pathCurve.getPoint(timeProgress);
            if (options2.rotationPerMs) {
              objectState.rotation = options2.startRotation.map(function(rad2, index) {
                return rad2 + options2.rotationPerMs[index] * timeProgress * options2.duration;
              });
            }
            if (options2.scalePerMs) {
              objectState.scale = options2.startScale.map(function(scale, index) {
                return scale + options2.scalePerMs[index] * timeProgress * options2.duration;
              });
            }
            object._setObject(objectState);
          }
          if (item.type === "followPath") {
            let position = options2.pathCurve.getPointAt(timeProgress);
            let objectState = { worldCoordinates: position };
            if (options2.trackHeading) {
              let tangent = options2.pathCurve.getTangentAt(timeProgress).normalize();
              let axis = new THREE.Vector3(0, 0, 0);
              let up = new THREE.Vector3(0, 1, 0);
              axis.crossVectors(up, tangent).normalize();
              let radians = Math.acos(up.dot(tangent));
              objectState.quaternion = [axis, radians];
            }
            object._setObject(objectState);
          }
          if (item.type === "playDefault") {
            object.activateAllActions();
            object.isPlaying = true;
            object.animationMethod = requestAnimationFrame(this.update);
            object.mixer.update(object.clock.getDelta());
            object.threebox.map.repaint = true;
          }
        }
      }
    }
    this.previousFrameTime = now;
  }
};
const defaults = {
  followPath: {
    path: null,
    duration: 1e3,
    trackHeading: true
  }
};
class CSS2DObject extends THREE.Object3D {
  constructor(element) {
    super();
    this.element = element || document.createElement("div");
    this.element.style.position = "absolute";
    this.element.style.userSelect = "none";
    this.element.setAttribute("draggable", false);
    this.alwaysVisible = false;
    Object.defineProperty(this, "layer", {
      get() {
        return this.parent && this.parent.parent ? this.parent.parent.layer : null;
      }
    });
    this.dispose = function() {
      this.remove();
      this.element = null;
    };
    this.remove = function() {
      if (this.element instanceof Element && this.element.parentNode !== null) {
        this.element.parentNode.removeChild(this.element);
      }
    };
    this.addEventListener("removed", function() {
      this.remove();
    });
  }
  copy(source, recursive) {
    super.copy(source, recursive);
    this.element = source.element.cloneNode(true);
    return this;
  }
}
CSS2DObject.prototype.isCSS2DObject = true;
const _vector = new THREE.Vector3();
const _viewMatrix = new THREE.Matrix4();
const _viewProjectionMatrix = new THREE.Matrix4();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
class CSS2DRenderer {
  constructor() {
    const _this = this;
    let _width, _height;
    let _widthHalf, _heightHalf;
    const cache = {
      objects: /* @__PURE__ */ new WeakMap(),
      list: /* @__PURE__ */ new Map()
    };
    this.cacheList = cache.list;
    const domElement = document.createElement("div");
    domElement.style.overflow = "hidden";
    this.domElement = domElement;
    this.getSize = function() {
      return {
        width: _width,
        height: _height
      };
    };
    this.render = function(scene, camera) {
      if (scene.autoUpdate === true) scene.updateMatrixWorld();
      if (camera.parent === null) camera.updateMatrixWorld();
      _viewMatrix.copy(camera.matrixWorldInverse);
      _viewProjectionMatrix.multiplyMatrices(camera.projectionMatrix, _viewMatrix);
      renderObject(scene, scene, camera);
      zOrder(scene);
    };
    this.setSize = function(width, height) {
      _width = width;
      _height = height;
      _widthHalf = _width / 2;
      _heightHalf = _height / 2;
      domElement.style.width = width + "px";
      domElement.style.height = height + "px";
    };
    function renderObject(object, scene, camera) {
      if (object.isCSS2DObject) {
        if (!object.visible) {
          cache.objects.delete({ key: object.uuid });
          cache.list.delete(object.uuid);
          object.remove();
        } else {
          object.onBeforeRender(_this, scene, camera);
          _vector.setFromMatrixPosition(object.matrixWorld);
          _vector.applyMatrix4(_viewProjectionMatrix);
          const element = object.element;
          var style;
          if (/apple/i.test(navigator.vendor)) {
            style = "translate(-50%,-50%) translate(" + Math.round(_vector.x * _widthHalf + _widthHalf) + "px," + Math.round(-_vector.y * _heightHalf + _heightHalf) + "px)";
          } else {
            style = "translate(-50%,-50%) translate(" + (_vector.x * _widthHalf + _widthHalf) + "px," + (-_vector.y * _heightHalf + _heightHalf) + "px)";
          }
          element.style.WebkitTransform = style;
          element.style.MozTransform = style;
          element.style.oTransform = style;
          element.style.transform = style;
          element.style.display = object.visible && _vector.z >= -1 && _vector.z <= 1 ? "" : "none";
          const objectData = {
            distanceToCameraSquared: getDistanceToSquared(camera, object)
          };
          cache.objects.set({ key: object.uuid }, objectData);
          cache.list.set(object.uuid, object);
          if (element.parentNode !== domElement) {
            domElement.appendChild(element);
          }
          object.onAfterRender(_this, scene, camera);
        }
      }
      for (let i = 0, l = object.children.length; i < l; i++) {
        renderObject(object.children[i], scene, camera);
      }
    }
    function getDistanceToSquared(object1, object2) {
      _a.setFromMatrixPosition(object1.matrixWorld);
      _b.setFromMatrixPosition(object2.matrixWorld);
      return _a.distanceToSquared(_b);
    }
    function filterAndFlatten(scene) {
      const result = [];
      scene.traverse(function(object) {
        if (object.isCSS2DObject) result.push(object);
      });
      return result;
    }
    function zOrder(scene) {
      const sorted = filterAndFlatten(scene).sort(function(a, b) {
        let cacheA = cache.objects.get({ key: a.uuid });
        let cacheB = cache.objects.get({ key: b.uuid });
        if (cacheA && cacheB) {
          const distanceA = cacheA.distanceToCameraSquared;
          const distanceB = cacheB.distanceToCameraSquared;
          return distanceA - distanceB;
        }
      });
      const zMax = sorted.length;
      for (let i = 0, l = sorted.length; i < l; i++) {
        sorted[i].element.style.zIndex = zMax - i;
      }
    }
  }
}
function Objects() {
}
Objects.prototype = {
  // standard 1px line with gl
  line: function(obj) {
    obj = utils._validate(obj, this._defaults.line);
    var straightProject = utils.lnglatsToWorld(obj.geometry);
    var normalized = utils.normalizeVertices(straightProject);
    var flattenedArray = utils.flattenVectors(normalized.vertices);
    var positions = new Float32Array(flattenedArray);
    var geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    var material2 = new THREE.LineBasicMaterial({ color: 16711680, linewidth: 21 });
    var line2 = new THREE.Line(geometry, material2);
    line2.options = options || {};
    line2.position.copy(normalized.position);
    return line2;
  },
  extrusion: function(options2) {
  },
  unenroll: function(obj, isStatic) {
    var root = this;
    if (isStatic) ;
    else {
      root.animationManager.unenroll(obj);
    }
  },
  _addMethods: function(obj, isStatic) {
    var root = this;
    const labelName = "label";
    const tooltipName = "tooltip";
    const helpName = "help";
    const shadowPlane = "shadowPlane";
    if (isStatic) ;
    else {
      let _applyAxisAngle = function(model, point, axis, degrees) {
        let theta = utils.radify(degrees);
        model.position.sub(point);
        model.position.applyAxisAngle(axis, theta);
        model.position.add(point);
        model.rotateOnAxis(axis, theta);
        obj.threebox.map.repaint = true;
      }, zoomScale = function(zoom) {
        return Math.pow(2, zoom);
      };
      if (!obj.coordinates) obj.coordinates = [0, 0, 0];
      Object.defineProperty(obj, "model", {
        get() {
          return obj.getObjectByName("model");
        }
      });
      Object.defineProperty(obj, "animations", {
        get() {
          const model = obj.model;
          if (model) {
            return model.animations;
          } else return null;
        }
        //set(value) { _animations = value}
      });
      root.animationManager.enroll(obj);
      obj.setCoords = function(lnglat) {
        if (obj.userData.topMargin && obj.userData.feature) {
          lnglat[2] += ((obj.userData.feature.properties.height || 0) - (obj.userData.feature.properties.base_height || obj.userData.feature.properties.min_height || 0)) * (obj.userData.topMargin || 0);
        }
        obj.coordinates = lnglat;
        obj.set({ position: lnglat });
        return obj;
      };
      obj.setTranslate = function(lnglat) {
        obj.set({ translate: lnglat });
        return obj;
      };
      obj.setRotation = function(xyz) {
        if (typeof xyz === "number") xyz = { z: xyz };
        var r = {
          x: utils.radify(xyz.x) || obj.rotation.x,
          y: utils.radify(xyz.y) || obj.rotation.y,
          z: utils.radify(xyz.z) || obj.rotation.z
        };
        obj._setObject({ rotation: [r.x, r.y, r.z] });
      };
      obj.calculateAdjustedPosition = function(lnglat, xyz, inverse) {
        let location = lnglat.slice();
        let newCoords = utils.unprojectFromWorld(obj.modelSize);
        if (inverse) {
          location[0] -= xyz.x != 0 ? newCoords[0] / xyz.x : 0;
          location[1] -= xyz.y != 0 ? newCoords[1] / xyz.y : 0;
          location[2] -= xyz.z != 0 ? newCoords[2] / xyz.z : 0;
        } else {
          location[0] += xyz.x != 0 ? newCoords[0] / xyz.x : 0;
          location[1] += xyz.y != 0 ? newCoords[1] / xyz.y : 0;
          location[2] += xyz.z != 0 ? newCoords[2] / xyz.z : 0;
        }
        return location;
      };
      obj.setRotationAxis = function(xyz) {
        if (typeof xyz === "number") xyz = { z: xyz };
        let bb = obj.modelBox();
        let point = new THREE.Vector3(bb.max.x, bb.max.y, bb.min.z);
        if (xyz.x != 0) _applyAxisAngle(obj, point, new THREE.Vector3(0, 0, 1), xyz.x);
        if (xyz.y != 0) _applyAxisAngle(obj, point, new THREE.Vector3(0, 0, 1), xyz.y);
        if (xyz.z != 0) _applyAxisAngle(obj, point, new THREE.Vector3(0, 0, 1), xyz.z);
      };
      Object.defineProperty(obj, "scaleGroup", {
        get() {
          return obj.getObjectByName("scaleGroup");
        }
      });
      Object.defineProperty(obj, "boxGroup", {
        get() {
          return obj.getObjectByName("boxGroup");
        }
      });
      Object.defineProperty(obj, "boundingBox", {
        get() {
          return obj.getObjectByName("boxModel");
        }
      });
      Object.defineProperty(obj, "boundingBoxShadow", {
        get() {
          return obj.getObjectByName("boxShadow");
        }
      });
      obj.drawBoundingBox = function() {
        let bb = obj.box3();
        let boxGroup = new THREE.Group();
        boxGroup.name = "boxGroup";
        boxGroup.updateMatrixWorld(true);
        let boxModel = new THREE.Box3Helper(bb, Objects.prototype._defaults.colors.yellow);
        boxModel.name = "boxModel";
        boxGroup.add(boxModel);
        boxModel.layers.disable(0);
        let bb2 = bb.clone();
        bb2.max.z = bb2.min.z;
        let boxShadow = new THREE.Box3Helper(bb2, Objects.prototype._defaults.colors.black);
        boxShadow.name = "boxShadow";
        boxGroup.add(boxShadow);
        boxShadow.layers.disable(0);
        boxGroup.visible = false;
        obj.scaleGroup.add(boxGroup);
        obj.setBoundingBoxShadowFloor();
      };
      obj.setBoundingBoxShadowFloor = function() {
        if (obj.boundingBoxShadow) {
          let h = -obj.modelHeight, r = obj.rotation, o2 = obj.boundingBoxShadow;
          o2.box.max.z = o2.box.min.z = h;
          o2.rotation.y = r.y;
          o2.rotation.x = -r.x;
        }
      };
      obj.setAnchor = function(anchor) {
        const b = obj.box3();
        const c = b.getCenter(new THREE.Vector3());
        obj.none = { x: 0, y: 0, z: 0 };
        obj.center = { x: c.x, y: c.y, z: b.min.z };
        obj.bottom = { x: c.x, y: b.max.y, z: b.min.z };
        obj.bottomLeft = { x: b.max.x, y: b.max.y, z: b.min.z };
        obj.bottomRight = { x: b.min.x, y: b.max.y, z: b.min.z };
        obj.top = { x: c.x, y: b.min.y, z: b.min.z };
        obj.topLeft = { x: b.max.x, y: b.min.y, z: b.min.z };
        obj.topRight = { x: b.min.x, y: b.min.y, z: b.min.z };
        obj.left = { x: b.max.x, y: c.y, z: b.min.z };
        obj.right = { x: b.min.x, y: c.y, z: b.min.z };
        switch (anchor) {
          case "center":
            obj.anchor = obj.center;
            break;
          case "top":
            obj.anchor = obj.top;
            break;
          case "top-left":
            obj.anchor = obj.topLeft;
            break;
          case "top-right":
            obj.anchor = obj.topRight;
            break;
          case "left":
            obj.anchor = obj.left;
            break;
          case "right":
            obj.anchor = obj.right;
            break;
          case "bottom":
            obj.anchor = obj.bottom;
            break;
          case "bottom-left":
          default:
            obj.anchor = obj.bottomLeft;
            break;
          case "bottom-right":
            obj.anchor = obj.bottomRight;
            break;
          case "auto":
          case "none":
            obj.anchor = obj.none;
        }
        obj.model.position.set(-obj.anchor.x, -obj.anchor.y, -obj.anchor.z);
      };
      obj.setCenter = function(center) {
        if (center && (center.x != 0 || center.y != 0 || center.z != 0)) {
          let size = obj.getSize();
          obj.anchor = { x: obj.anchor.x - size.x * center.x, y: obj.anchor.y - size.y * center.y, z: obj.anchor.z - size.z * center.z };
          obj.model.position.set(-obj.anchor.x, -obj.anchor.y, -obj.anchor.z);
        }
      };
      Object.defineProperty(obj, "label", {
        get() {
          return obj.getObjectByName(labelName);
        }
      });
      Object.defineProperty(obj, "tooltip", {
        get() {
          return obj.getObjectByName(tooltipName);
        }
      });
      Object.defineProperty(obj, "help", {
        get() {
          return obj.getObjectByName(helpName);
        }
      });
      let _hidden = false;
      Object.defineProperty(obj, "hidden", {
        get() {
          return _hidden;
        },
        set(value) {
          if (_hidden != value) {
            _hidden = value;
            obj.visibility = !_hidden;
          }
        }
      });
      Object.defineProperty(obj, "visibility", {
        get() {
          return obj.visible;
        },
        set(value) {
          let _value = value;
          if (value == "visible" || value == true) {
            _value = true;
            if (obj.label) obj.label.visible = _value;
          } else if (value == "none" || value == false) {
            _value = false;
            if (obj.label && obj.label.alwaysVisible) obj.label.visible = _value;
            if (obj.tooltip) obj.tooltip.visible = _value;
          } else return;
          if (obj.visible != _value) {
            if (obj.hidden && _value) return;
            obj.visible = _value;
            if (obj.model) {
              obj.model.traverse(function(c) {
                if (c.type == "Mesh" || c.type == "SkinnedMesh") {
                  if (_value && obj.raycasted) {
                    c.layers.enable(0);
                  } else {
                    c.layers.disable(0);
                  }
                }
                if (c.type == "LineSegments") {
                  c.layers.disableAll();
                }
              });
            }
          }
        }
      });
      obj.addLabel = function(HTMLElement, visible, center, height) {
        if (HTMLElement) {
          obj.drawLabelHTML(HTMLElement, visible, center, height);
        }
      };
      obj.removeLabel = function() {
        obj.removeCSS2D(labelName);
      };
      obj.drawLabelHTML = function(HTMLElement, visible = false, center = obj.anchor, height = 0.5) {
        let divLabel = root.drawLabelHTML(HTMLElement, Objects.prototype._defaults.label.cssClass);
        let label = obj.addCSS2D(divLabel, labelName, center, height);
        label.alwaysVisible = visible;
        label.visible = visible;
        return label;
      };
      obj.addTooltip = function(tooltipText, mapboxStyle, center, custom = true, height = 1) {
        let t = obj.addHelp(tooltipText, tooltipName, mapboxStyle, center, height);
        t.visible = false;
        t.custom = custom;
      };
      obj.removeTooltip = function() {
        obj.removeCSS2D(tooltipName);
      };
      obj.addHelp = function(helpText, objName = helpName, mapboxStyle = false, center = obj.anchor, height = 0) {
        let divHelp = root.drawTooltip(helpText, mapboxStyle);
        let h = obj.addCSS2D(divHelp, objName, center, height);
        h.visible = true;
        return h;
      };
      obj.removeHelp = function() {
        obj.removeCSS2D(helpName);
      };
      obj.addCSS2D = function(element, objName, center = obj.anchor, height = 1) {
        if (element) {
          const box = obj.box3();
          const size = box.getSize(new THREE.Vector3());
          let bottomLeft = { x: box.max.x, y: box.max.y, z: box.min.z };
          obj.removeCSS2D(objName);
          let c = new CSS2DObject(element);
          c.name = objName;
          c.position.set(-size.x * 0.5 - obj.model.position.x - center.x + bottomLeft.x, -size.y * 0.5 - obj.model.position.y - center.y + bottomLeft.y, size.z * height);
          c.visible = false;
          obj.scaleGroup.add(c);
          return c;
        }
      };
      obj.removeCSS2D = function(objName) {
        let css2D = obj.getObjectByName(objName);
        if (css2D) {
          css2D.dispose();
          let g = obj.scaleGroup.children;
          g.splice(g.indexOf(css2D), 1);
        }
      };
      Object.defineProperty(obj, "shadowPlane", {
        get() {
          return obj.getObjectByName(shadowPlane);
        }
      });
      let _castShadow = false;
      Object.defineProperty(obj, "castShadow", {
        get() {
          return _castShadow;
        },
        set(value) {
          if (!obj.model || _castShadow === value) return;
          obj.model.traverse(function(c) {
            if (c.isMesh) c.castShadow = true;
          });
          if (value) {
            const s = obj.modelSize;
            const sz = [s.x, s.y, s.z, obj.modelHeight];
            const pSize = Math.max(...sz) * 10;
            const pGeo = new THREE.PlaneGeometry(pSize, pSize);
            const pMat = new THREE.ShadowMaterial();
            pMat.opacity = 0.5;
            let p = new THREE.Mesh(pGeo, pMat);
            p.name = shadowPlane;
            p.layers.enable(1);
            p.layers.disable(0);
            p.receiveShadow = value;
            obj.add(p);
          } else {
            obj.traverse(function(c) {
              if (c.isMesh && c.material instanceof THREE.ShadowMaterial)
                obj.remove(c);
            });
          }
          _castShadow = value;
        }
      });
      obj.setReceiveShadowFloor = function() {
        if (obj.castShadow) {
          let sp = obj.shadowPlane, p = sp.position, r = sp.rotation;
          p.z = -obj.modelHeight;
          r.y = obj.rotation.y;
          r.x = -obj.rotation.x;
          if (obj.userData.units === "meters") {
            const s = obj.modelSize;
            const sz = [s.x, s.y, s.z, -p.z];
            const ps = Math.max(...sz) * 10;
            const sc = ps / sp.geometry.parameters.width;
            sp.scale.set(sc, sc, sc);
          }
        }
      };
      let _receiveShadow = false;
      Object.defineProperty(obj, "receiveShadow", {
        get() {
          return _receiveShadow;
        },
        set(value) {
          if (!obj.model || _receiveShadow === value) return;
          obj.model.traverse(function(c) {
            if (c.isMesh) c.receiveShadow = true;
          });
          _receiveShadow = value;
        }
      });
      let _wireframe = false;
      Object.defineProperty(obj, "wireframe", {
        get() {
          return _wireframe;
        },
        set(value) {
          if (!obj.model || _wireframe === value) return;
          obj.model.traverse(function(c) {
            if (c.type == "Mesh" || c.type == "SkinnedMesh") {
              let materials = [];
              if (!Array.isArray(c.material)) {
                materials.push(c.material);
              } else {
                materials = c.material;
              }
              let m = materials[0];
              if (value) {
                c.userData.materials = m;
                c.material = m.clone();
                c.material.wireframe = c.material.transparent = value;
                c.material.opacity = 0.3;
              } else {
                c.material.dispose();
                c.material = c.userData.materials;
                c.userData.materials.dispose();
                c.userData.materials = null;
              }
              if (value) {
                c.layers.disable(0);
                c.layers.enable(1);
              } else {
                c.layers.disable(1);
                c.layers.enable(0);
              }
            }
            if (c.type == "LineSegments") {
              c.layers.disableAll();
            }
          });
          _wireframe = value;
          obj.dispatchEvent({ type: "Wireframed", detail: obj });
        }
      });
      let _color = null;
      Object.defineProperty(obj, "color", {
        get() {
          return _color;
        },
        set(value) {
          if (!obj.model || _color === value) return;
          obj.model.traverse(function(c) {
            if (c.type == "Mesh" || c.type == "SkinnedMesh") {
              let materials = [];
              if (!Array.isArray(c.material)) {
                materials.push(c.material);
              } else {
                materials = c.material;
              }
              let m = materials[0];
              if (value) {
                c.userData.materials = m;
                c.material = new THREE.MeshStandardMaterial();
                c.material.color.setHex(value);
              } else {
                c.material.dispose();
                c.material = c.userData.materials;
                c.userData.materials.dispose();
                c.userData.materials = null;
              }
            }
          });
          _color = value;
        }
      });
      let _selected = false;
      Object.defineProperty(obj, "selected", {
        get() {
          return _selected;
        },
        set(value) {
          if (value) {
            if (obj.userData.bbox && !obj.boundingBox) obj.drawBoundingBox();
            if (obj.boxGroup) {
              obj.boundingBox.material = Objects.prototype._defaults.materials.boxSelectedMaterial;
              obj.boundingBox.parent.visible = true;
              obj.boundingBox.layers.enable(1);
              obj.boundingBoxShadow.layers.enable(1);
            }
            if (obj.label && !obj.label.alwaysVisible) obj.label.visible = true;
          } else {
            if (obj.boxGroup) {
              obj.remove(obj.boxGroup);
            }
            if (obj.label && !obj.label.alwaysVisible) obj.label.visible = false;
            obj.removeHelp();
          }
          if (obj.tooltip) obj.tooltip.visible = value;
          if (_selected != value) {
            _selected = value;
            obj.dispatchEvent({ type: "SelectedChange", detail: obj });
          }
        }
      });
      let _raycasted = true;
      Object.defineProperty(obj, "raycasted", {
        get() {
          return _raycasted;
        },
        set(value) {
          if (!obj.model || _raycasted === value) return;
          obj.model.traverse(function(c) {
            if (c.type == "Mesh" || c.type == "SkinnedMesh") {
              if (!value) {
                c.layers.disable(0);
                c.layers.enable(1);
              } else {
                c.layers.disable(1);
                c.layers.enable(0);
              }
            }
          });
          _raycasted = value;
        }
      });
      let _over = false;
      Object.defineProperty(obj, "over", {
        get() {
          return _over;
        },
        set(value) {
          if (value) {
            if (!obj.selected) {
              if (obj.userData.bbox && !obj.boundingBox) obj.drawBoundingBox();
              if (obj.userData.tooltip && !obj.tooltip) obj.addTooltip(obj.uuid, true, obj.anchor, false);
              if (obj.boxGroup) {
                obj.boundingBox.material = Objects.prototype._defaults.materials.boxOverMaterial;
                obj.boundingBox.parent.visible = true;
                obj.boundingBox.layers.enable(1);
                obj.boundingBoxShadow.layers.enable(1);
              }
            }
            if (obj.label && !obj.label.alwaysVisible) {
              obj.label.visible = true;
            }
            obj.dispatchEvent({ type: "ObjectMouseOver", detail: obj });
          } else {
            if (!obj.selected) {
              if (obj.boxGroup) {
                obj.remove(obj.boxGroup);
                if (obj.tooltip && !obj.tooltip.custom) obj.removeTooltip();
              }
              if (obj.label && !obj.label.alwaysVisible) {
                obj.label.visible = false;
              }
            }
            obj.dispatchEvent({ type: "ObjectMouseOut", detail: obj });
          }
          if (obj.tooltip) obj.tooltip.visible = value || obj.selected;
          _over = value;
        }
      });
      obj.box3 = function() {
        obj.updateMatrix();
        obj.updateMatrixWorld(true, true);
        let bounds;
        if (obj.model) {
          let dup = obj.clone(true);
          let model = obj.model.clone();
          bounds = new THREE.Box3().setFromObject(model);
          if (obj.parent) {
            let rm = new THREE.Matrix4();
            let rmi = new THREE.Matrix4();
            obj.matrix.extractRotation(rm);
            rmi.copy(rm).invert();
            dup.setRotationFromMatrix(rmi);
            bounds = new THREE.Box3().setFromObject(model);
          }
        }
        return bounds;
      };
      obj.modelBox = function() {
        return obj.box3();
      };
      obj.getSize = function() {
        return obj.box3().getSize(new THREE.Vector3(0, 0, 0));
      };
      let _modelSize = false;
      Object.defineProperty(obj, "modelSize", {
        get() {
          _modelSize = obj.getSize();
          return _modelSize;
        },
        set(value) {
          if (_modelSize != value) {
            _modelSize = value;
          }
        }
      });
      Object.defineProperty(obj, "modelHeight", {
        get() {
          let h = obj.coordinates[2] || 0;
          if (obj.userData.units === "scene") h *= obj.unitsPerMeter / obj.scale.x;
          return h;
        }
      });
      Object.defineProperty(obj, "unitsPerMeter", {
        get() {
          return Number(utils.projectedUnitsPerMeter(obj.coordinates[1]).toFixed(7));
        }
      });
      Object.defineProperty(obj, "fixedZoom", {
        get() {
          return obj.userData.fixedZoom;
        },
        set(value) {
          if (obj.userData.fixedZoom === value) return;
          obj.userData.fixedZoom = value;
          obj.userData.units = value ? "scene" : "meters";
        }
      });
      obj.setFixedZoom = function(scale) {
        if (obj.fixedZoom != null && obj.fixedZoom != 0) {
          if (!scale) scale = obj.userData.mapScale;
          let s = zoomScale(obj.fixedZoom);
          if (s > scale) {
            let calc = s / scale;
            obj.scale.set(calc, calc, calc);
          } else {
            obj.scale.set(1, 1, 1);
          }
        }
      };
      obj.setScale = function(scale) {
        if (obj.userData.units != "scene") {
          let s = obj.unitsPerMeter;
          obj.scale.set(s, s, s);
        } else if (obj.fixedZoom) {
          if (scale) obj.userData.mapScale = scale;
          obj.setFixedZoom(obj.userData.mapScale);
        } else obj.scale.set(1, 1, 1);
      };
      obj.setObjectScale = function(scale) {
        obj.setScale(scale);
        obj.setBoundingBoxShadowFloor();
        obj.setReceiveShadowFloor();
      };
    }
    obj.add = function(o2) {
      obj.scaleGroup.add(o2);
      o2.position.z = obj.coordinates[2] ? -obj.coordinates[2] : 0;
      return o2;
    };
    obj.remove = function(o2) {
      if (!o2) return;
      o2.traverse((m) => {
        if (m.geometry) m.geometry.dispose();
        if (m.material) {
          if (m.material.isMaterial) {
            cleanMaterial(m.material);
          } else {
            for (const material2 of m.material) cleanMaterial(material2);
          }
        }
        if (m.dispose) m.dispose();
      });
      obj.scaleGroup.remove(o2);
      obj.threebox.map.repaint = true;
    };
    obj.duplicate = function(options2) {
      let dupe = obj.clone(true);
      dupe.threebox = obj.threebox;
      dupe.getObjectByName("model").animations = obj.animations;
      if (dupe.userData.feature) {
        if (options2 && options2.feature) dupe.userData.feature = options2.feature;
        dupe.userData.feature.properties.uuid = dupe.uuid;
      }
      root._addMethods(dupe);
      if (!options2 || utils.equal(options2.scale, obj.userData.scale)) {
        dupe.copyAnchor(obj);
        return dupe;
      } else {
        dupe.userData = options2;
        dupe.userData.isGeoGroup = true;
        dupe.remove(dupe.boxGroup);
        const r = utils.types.rotation(options2.rotation, [0, 0, 0]);
        const s = utils.types.scale(options2.scale, [1, 1, 1]);
        dupe.model.position.set(0, 0, 0);
        dupe.model.rotation.set(r[0], r[1], r[2]);
        dupe.model.scale.set(s[0], s[1], s[2]);
        dupe.setAnchor(options2.anchor);
        dupe.setCenter(options2.adjustment);
        return dupe;
      }
    };
    obj.copyAnchor = function(o2) {
      obj.anchor = o2.anchor;
      obj.none = { x: 0, y: 0, z: 0 };
      obj.center = o2.center;
      obj.bottom = o2.bottom;
      obj.bottomLeft = o2.bottomLeft;
      obj.bottomRight = o2.bottomRight;
      obj.top = o2.top;
      obj.topLeft = o2.topLeft;
      obj.topRight = o2.topRight;
      obj.left = o2.left;
      obj.right = o2.right;
    };
    obj.dispose = function() {
      Objects.prototype.unenroll(obj);
      obj.traverse((o2) => {
        if (o2.parent && o2.parent.name == "world") return;
        if (o2.name === "threeboxObject") return;
        if (o2.geometry) o2.geometry.dispose();
        if (o2.material) {
          if (o2.material.isMaterial) {
            cleanMaterial(o2.material);
          } else {
            for (const material2 of o2.material) cleanMaterial(material2);
          }
        }
        if (o2.dispose) o2.dispose();
      });
      obj.children = [];
    };
    const cleanMaterial = (material2) => {
      material2.dispose();
      for (const key of Object.keys(material2)) {
        const value = material2[key];
        if (value && typeof value === "object" && "minFilter" in value) {
          value.dispose();
        }
      }
      let m = material2;
      let md = m.map || m.alphaMap || m.aoMap || m.bumpMap || m.displacementMap || m.emissiveMap || m.envMap || m.lightMap || m.metalnessMap || m.normalMap || m.roughnessMap;
      if (md) {
        if (m.map) m.map.dispose();
        if (m.alphaMap) m.alphaMap.dispose();
        if (m.aoMap) m.aoMap.dispose();
        if (m.bumpMap) m.bumpMap.dispose();
        if (m.displacementMap) m.displacementMap.dispose();
        if (m.emissiveMap) m.emissiveMap.dispose();
        if (m.envMap) m.envMap.dispose();
        if (m.lightMap) m.lightMap.dispose();
        if (m.metalnessMap) m.metalnessMap.dispose();
        if (m.normalMap) m.normalMap.dispose();
        if (m.roughnessMap) m.roughnessMap.dispose();
      }
    };
    return obj;
  },
  _makeGroup: function(obj, options2) {
    let projScaleGroup = new THREE.Group();
    projScaleGroup.name = "scaleGroup";
    projScaleGroup.add(obj);
    var geoGroup = new THREE.Group();
    geoGroup.userData = options2 || {};
    geoGroup.userData.isGeoGroup = true;
    if (geoGroup.userData.feature) {
      geoGroup.userData.feature.properties.uuid = geoGroup.uuid;
    }
    var isArrayOfObjects = projScaleGroup.length;
    if (isArrayOfObjects) for (o of projScaleGroup) geoGroup.add(o);
    else geoGroup.add(projScaleGroup);
    geoGroup.name = "threeboxObject";
    return geoGroup;
  },
  animationManager: new AnimationManager(),
  //[jscastro] add tooltip method 
  drawTooltip: function(tooltipText, mapboxStyle = false) {
    if (tooltipText) {
      let divToolTip;
      if (mapboxStyle) {
        let divContent = document.createElement("div");
        divContent.className = "mapboxgl-popup-content";
        let strong = document.createElement("strong");
        strong.innerHTML = tooltipText;
        divContent.appendChild(strong);
        let tip = document.createElement("div");
        tip.className = "mapboxgl-popup-tip";
        let div = document.createElement("div");
        div.className = "marker mapboxgl-popup-anchor-bottom";
        div.appendChild(tip);
        div.appendChild(divContent);
        divToolTip = document.createElement("div");
        divToolTip.className += "label3D";
        divToolTip.appendChild(div);
      } else {
        divToolTip = document.createElement("span");
        divToolTip.className = this._defaults.tooltip.cssClass;
        divToolTip.innerHTML = tooltipText;
      }
      return divToolTip;
    }
  },
  //[jscastro] draw label method can be invoked separately
  drawLabelHTML: function(HTMLElement, cssClass) {
    let div = document.createElement("div");
    div.className += cssClass;
    if (typeof HTMLElement == "string") {
      div.innerHTML = HTMLElement;
    } else {
      div.innerHTML = HTMLElement.outerHTML;
    }
    return div;
  },
  _defaults: {
    colors: {
      red: new THREE.Color(16711680),
      yellow: new THREE.Color(16776960),
      green: new THREE.Color(65280),
      black: new THREE.Color(0)
    },
    materials: {
      boxNormalMaterial: new THREE.LineBasicMaterial({ color: new THREE.Color(16711680) }),
      boxOverMaterial: new THREE.LineBasicMaterial({ color: new THREE.Color(16776960) }),
      boxSelectedMaterial: new THREE.LineBasicMaterial({ color: new THREE.Color(65280) })
    },
    line: {
      geometry: null,
      color: "black",
      width: 1,
      opacity: 1
    },
    label: {
      htmlElement: null,
      cssClass: " label3D",
      alwaysVisible: false,
      topMargin: -0.5
    },
    tooltip: {
      text: "",
      cssClass: "toolTip text-xs",
      mapboxStyle: false,
      topMargin: 0
    },
    sphere: {
      position: [0, 0, 0],
      radius: 1,
      sides: 20,
      units: "scene",
      material: "MeshBasicMaterial",
      anchor: "bottom-left",
      bbox: true,
      tooltip: true,
      raycasted: true
    },
    tube: {
      geometry: null,
      radius: 1,
      sides: 6,
      units: "scene",
      material: "MeshBasicMaterial",
      anchor: "center",
      bbox: true,
      tooltip: true,
      raycasted: true
    },
    loadObj: {
      type: null,
      obj: null,
      units: "scene",
      scale: 1,
      rotation: 0,
      defaultAnimation: 0,
      anchor: "bottom-left",
      bbox: true,
      tooltip: true,
      raycasted: true,
      clone: true,
      withCredentials: false
    },
    Object3D: {
      obj: null,
      units: "scene",
      anchor: "bottom-left",
      bbox: true,
      tooltip: true,
      raycasted: true
    },
    extrusion: {
      coordinates: [[[]]],
      geometryOptions: {},
      height: 100,
      materials: new THREE.MeshPhongMaterial({ color: 6684672, side: THREE.DoubleSide }),
      scale: 1,
      rotation: 0,
      units: "scene",
      anchor: "center",
      bbox: true,
      tooltip: true,
      raycasted: true
    }
  },
  geometries: {
    line: ["LineString"],
    tube: ["LineString"],
    sphere: ["Point"]
  }
};
function Object3D(opt) {
  opt = utils._validate(opt, Objects.prototype._defaults.Object3D);
  let obj = opt.obj;
  const r = utils.types.rotation(opt.rotation, [0, 0, 0]);
  const s = utils.types.scale(opt.scale, [1, 1, 1]);
  obj.rotation.set(r[0], r[1], r[2]);
  obj.scale.set(s[0], s[1], s[2]);
  obj.name = "model";
  let userScaleGroup = Objects.prototype._makeGroup(obj, opt);
  opt.obj.name = "model";
  Objects.prototype._addMethods(userScaleGroup);
  userScaleGroup.setAnchor(opt.anchor);
  userScaleGroup.setCenter(opt.adjustment);
  userScaleGroup.raycasted = opt.raycasted;
  userScaleGroup.visibility = true;
  return userScaleGroup;
}
function Sphere(opt) {
  opt = utils._validate(opt, Objects.prototype._defaults.sphere);
  let geometry = new THREE.SphereGeometry(opt.radius, opt.sides, opt.sides);
  let mat = material(opt);
  let output = new THREE.Mesh(geometry, mat);
  return new Object3D({ obj: output, units: opt.units, anchor: opt.anchor, adjustment: opt.adjustment, bbox: opt.bbox, tooltip: opt.tooltip, raycasted: opt.raycasted });
}
function extrusion(opt) {
  opt = utils._validate(opt, Objects.prototype._defaults.extrusion);
  let shape = extrusion.prototype.buildShape(opt.coordinates);
  let geometry = extrusion.prototype.buildGeometry(shape, opt.geometryOptions);
  let mesh = new THREE.Mesh(geometry, opt.materials);
  opt.obj = mesh;
  return new Object3D(opt);
}
extrusion.prototype = {
  buildShape: function(coords) {
    if (coords[0] instanceof (THREE.Vector2 || THREE.Vector3)) return new THREE.Shape(coords);
    let shape = new THREE.Shape();
    for (let i = 0; i < coords.length; i++) {
      if (i === 0) {
        shape = new THREE.Shape(this.buildPoints(coords[0], coords[0]));
      } else {
        shape.holes.push(new THREE.Path(this.buildPoints(coords[i], coords[0])));
      }
    }
    return shape;
  },
  buildPoints: function(coords, initCoords) {
    const points = [];
    let init = utils.projectToWorld([initCoords[0][0], initCoords[0][1], 0]);
    for (let i = 0; i < coords.length; i++) {
      let pos = utils.projectToWorld([coords[i][0], coords[i][1], 0]);
      points.push(new THREE.Vector2(utils.toDecimal(pos.x - init.x, 9), utils.toDecimal(pos.y - init.y, 9)));
    }
    return points;
  },
  buildGeometry: function(shape, settings) {
    let geometry = new THREE.ExtrudeGeometry(shape, settings);
    geometry.computeBoundingBox();
    return geometry;
  }
};
function Label(obj) {
  obj = utils._validate(obj, Objects.prototype._defaults.label);
  let div = Objects.prototype.drawLabelHTML(obj.htmlElement, obj.cssClass);
  let label = new CSS2DObject(div);
  label.name = "label";
  label.visible = obj.alwaysVisible;
  label.alwaysVisible = obj.alwaysVisible;
  var userScaleGroup = Objects.prototype._makeGroup(label, obj);
  Objects.prototype._addMethods(userScaleGroup);
  userScaleGroup.visibility = obj.alwaysVisible;
  return userScaleGroup;
}
function Tooltip(obj) {
  obj = utils._validate(obj, Objects.prototype._defaults.tooltip);
  if (obj.text) {
    let divToolTip = Objects.prototype.drawTooltip(obj.text, obj.mapboxStyle);
    let tooltip = new CSS2DObject(divToolTip);
    tooltip.visible = false;
    tooltip.name = "tooltip";
    var userScaleGroup = Objects.prototype._makeGroup(tooltip, obj);
    Objects.prototype._addMethods(userScaleGroup);
    return userScaleGroup;
  }
}
const objLoader = new OBJLoader();
const materialLoader = new MTLLoader();
const gltfLoader = new GLTFLoader();
const fbxLoader = new FBXLoader();
const daeLoader = new ColladaLoader();
function loadObj(options2, cb, promise) {
  if (options2 === void 0) return console.error("Invalid options provided to loadObj()");
  options2 = utils._validate(options2, Objects.prototype._defaults.loadObj);
  let loader;
  if (!options2.type) {
    options2.type = "mtl";
  }
  switch (options2.type) {
    case "mtl":
      loader = objLoader;
      break;
    case "gltf":
    case "glb":
      loader = gltfLoader;
      break;
    case "fbx":
      loader = fbxLoader;
      break;
    case "dae":
      loader = daeLoader;
      break;
  }
  if (options2.mtl) {
    materialLoader.withCredentials = options2.withCredentials;
    materialLoader.load(options2.mtl, loadObject, () => null, (error) => {
      console.warn("No material file found " + error.stack);
      loadObject(null);
    });
  } else {
    loadObject(null);
  }
  function loadObject(materials) {
    if (materials && options2.type == "mtl") {
      materials.preload();
      loader.setMaterials(materials);
    }
    loader.withCredentials = options2.withCredentials;
    loader.load(options2.obj, (obj) => {
      let animations = [];
      switch (options2.type) {
        case "mtl":
          obj = obj.children[0];
          break;
        case "gltf":
        case "glb":
        case "dae":
          animations = obj.animations;
          obj = obj.scene;
          break;
        case "fbx":
          animations = obj.animations;
          break;
      }
      obj.animations = animations;
      const r = utils.types.rotation(options2.rotation, [0, 0, 0]);
      const s = utils.types.scale(options2.scale, [1, 1, 1]);
      obj.rotation.set(r[0], r[1], r[2]);
      obj.scale.set(s[0], s[1], s[2]);
      if (options2.normalize) {
        normalizeSpecular(obj);
      }
      obj.name = "model";
      let userScaleGroup = Objects.prototype._makeGroup(obj, options2);
      Objects.prototype._addMethods(userScaleGroup);
      userScaleGroup.setAnchor(options2.anchor);
      userScaleGroup.setCenter(options2.adjustment);
      userScaleGroup.raycasted = options2.raycasted;
      promise(userScaleGroup);
      cb(userScaleGroup);
      userScaleGroup.setFixedZoom(options2.mapScale);
      userScaleGroup.idle();
    }, () => null, (error) => {
      console.error("Could not load model file: " + options2.obj + " \n " + error.stack);
      promise("Error loading the model");
    });
  }
  function normalizeSpecular(model) {
    model.traverse(function(c) {
      if (c.isMesh) {
        let specularColor;
        if (c.material.type == "MeshStandardMaterial") {
          if (c.material.metalness) {
            c.material.metalness *= 0.3;
          }
          if (c.material.glossiness) {
            c.material.glossiness *= 0.5;
          }
          specularColor = new THREE.Color(789516);
        } else if (c.material.type == "MeshPhongMaterial") {
          c.material.shininess = 0.3;
          specularColor = new THREE.Color(1315860);
        }
        if (c.material.specular && c.material.specular.isColor) {
          c.material.specular = specularColor;
        }
      }
    });
  }
}
function line(obj) {
  obj = utils._validate(obj, Objects.prototype._defaults.line);
  var straightProject = utils.lnglatsToWorld(obj.geometry);
  var normalized = utils.normalizeVertices(straightProject);
  var flattenedArray = utils.flattenVectors(normalized.vertices);
  var geometry = new LineGeometry();
  geometry.setPositions(flattenedArray);
  let matLine = new LineMaterial({
    color: obj.color,
    linewidth: obj.width,
    // in pixels
    dashed: false,
    opacity: obj.opacity
  });
  matLine.resolution.set(window.innerWidth, window.innerHeight);
  matLine.isMaterial = true;
  matLine.transparent = true;
  matLine.depthWrite = false;
  let lineObj = new Line2(geometry, matLine);
  lineObj.position.copy(normalized.position);
  lineObj.computeLineDistances();
  return lineObj;
}
function tube(opt, world) {
  opt = utils._validate(opt, Objects.prototype._defaults.tube);
  let points = [];
  opt.geometry.forEach((p) => {
    points.push(new THREE.Vector3(p[0], p[1], p[2]));
  });
  const curve = new THREE.CatmullRomCurve3(points);
  let tube2 = new THREE.TubeGeometry(curve, points.length, opt.radius, opt.sides, false);
  let mat = material(opt);
  let obj = new THREE.Mesh(tube2, mat);
  return new Object3D({ obj, units: opt.units, anchor: opt.anchor, adjustment: opt.adjustment, bbox: opt.bbox, tooltip: opt.tooltip, raycasted: opt.raycasted });
}
function LabelRenderer(map) {
  this.map = map;
  this.renderer = new CSS2DRenderer();
  this.renderer.setSize(this.map.getCanvas().clientWidth, this.map.getCanvas().clientHeight);
  this.renderer.domElement.style.position = "absolute";
  this.renderer.domElement.id = "labelCanvas";
  this.renderer.domElement.style.top = 0;
  this.renderer.domElement.style.zIndex = "0";
  this.map.getCanvasContainer().appendChild(this.renderer.domElement);
  this.scene, this.camera;
  this.dispose = function() {
    this.map.getCanvasContainer().removeChild(this.renderer.domElement);
    this.renderer.domElement.remove();
    this.renderer = {};
  };
  this.setSize = function(width, height) {
    this.renderer.setSize(width, height);
  };
  this.map.on("resize", (function() {
    this.renderer.setSize(this.map.getCanvas().clientWidth, this.map.getCanvas().clientHeight);
  }).bind(this));
  this.state = {
    reset: function() {
    }
  };
  this.render = async function(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    return new Promise((resolve) => {
      resolve(this.renderer.render(scene, camera));
    });
  };
  this.toggleLabels = async function(layerId, visible) {
    return new Promise((resolve) => {
      resolve(this.setVisibility(layerId, visible, this.scene, this.camera, this.renderer));
    });
  };
  this.setVisibility = function(layerId, visible, scene, camera, renderer2) {
    var cache = this.renderer.cacheList;
    cache.forEach(function(l) {
      if (l.visible != visible && l.layer === layerId) {
        if (visible && l.alwaysVisible || !visible) {
          l.visible = visible;
          renderer2.renderObject(l, scene, camera);
        }
      }
    });
  };
}
class BuildingShadows {
  constructor(options2, threebox) {
    this.id = options2.layerId;
    this.type = "custom";
    this.renderingMode = "3d";
    this.opacity = 0.5;
    this.buildingsLayerId = options2.buildingsLayerId;
    this.minAltitude = options2.minAltitude || 0.1;
    this.tb = threebox;
  }
  onAdd(map, gl) {
    var _a2, _b2, _c;
    this.map = map;
    const sourceName = this.map.getLayer(this.buildingsLayerId).source;
    const style = this.map.style;
    this.source = ((_a2 = style.sourceCaches) == null ? void 0 : _a2[sourceName]) || ((_b2 = style._otherSourceCaches) == null ? void 0 : _b2[sourceName]) || ((_c = style._sourceCaches) == null ? void 0 : _c[sourceName]);
    if (!this.source) {
      console.warn(`BuildingShadows: Can't find layer ${this.buildingsLayerId}'s source.`);
    }
    const vertexSource = this._getVertexSource();
    const fragmentSource = `
			void main() {
				gl_FragColor = vec4(0.0, 0.0, 0.0, 0.7);
			}
			`;
    const vertexShader = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(vertexShader, vertexSource);
    gl.compileShader(vertexShader);
    if (!gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS)) {
      console.error("BuildingShadows vertex shader error:", gl.getShaderInfoLog(vertexShader));
    }
    const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fragmentShader, fragmentSource);
    gl.compileShader(fragmentShader);
    if (!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)) {
      console.error("BuildingShadows fragment shader error:", gl.getShaderInfoLog(fragmentShader));
    }
    this.program = gl.createProgram();
    gl.attachShader(this.program, vertexShader);
    gl.attachShader(this.program, fragmentShader);
    gl.linkProgram(this.program);
    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
      console.error("BuildingShadows program link error:", gl.getProgramInfoLog(this.program));
    }
    gl.validateProgram(this.program);
    this.uMatrix = gl.getUniformLocation(this.program, "u_matrix");
    this.uHeightFactor = gl.getUniformLocation(this.program, "u_height_factor");
    this.uAltitude = gl.getUniformLocation(this.program, "u_altitude");
    this.uAzimuth = gl.getUniformLocation(this.program, "u_azimuth");
    if (this.tb.mapboxVersion >= 2) {
      this.aPosNormal = gl.getAttribLocation(this.program, "a_pos_normal_ed");
    } else {
      this.aPos = gl.getAttribLocation(this.program, "a_pos");
      this.aNormal = gl.getAttribLocation(this.program, "a_normal_ed");
    }
    this.aBase = gl.getAttribLocation(this.program, "a_base");
    this.aHeight = gl.getAttribLocation(this.program, "a_height");
  }
  render(gl, matrix) {
    var _a2, _b2;
    if (!this.source) return;
    gl.useProgram(this.program);
    const coords = this.source.getVisibleCoordinates().reverse();
    const buildingsLayer = this.map.getLayer(this.buildingsLayerId);
    const context = this.map.painter.context;
    const { lng, lat } = this.map.getCenter();
    const pos = this.tb.getSunPosition(this.tb.lightDateTime, [lng, lat]);
    gl.uniform1f(this.uAltitude, pos.altitude > this.minAltitude ? pos.altitude : 0);
    gl.uniform1f(this.uAzimuth, pos.azimuth + 3 * Math.PI / 2);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.disable(gl.DEPTH_TEST);
    for (const coord of coords) {
      const tile = this.source.getTile(coord);
      let bucket = tile.getBucket(buildingsLayer);
      if (!bucket && tile.buckets) {
        bucket = tile.buckets[this.buildingsLayerId];
      }
      if (!bucket) continue;
      let heightBuffer, baseBuffer;
      const programConfig = (_b2 = (_a2 = bucket.programConfigurations) == null ? void 0 : _a2.programConfigurations) == null ? void 0 : _b2[this.buildingsLayerId];
      if (programConfig == null ? void 0 : programConfig._buffers) {
        [heightBuffer, baseBuffer] = programConfig._buffers;
      } else if (programConfig == null ? void 0 : programConfig.getBuffers) {
        const buffers = programConfig.getBuffers();
        heightBuffer = buffers[0];
        baseBuffer = buffers[1];
      } else {
        continue;
      }
      gl.uniformMatrix4fv(this.uMatrix, false, coord.posMatrix || coord.projMatrix);
      gl.uniform1f(this.uHeightFactor, Math.pow(2, coord.overscaledZ) / tile.tileSize / 8);
      for (const segment of bucket.segments.get()) {
        const numPrevAttrib = context.currentNumAttributes || 0;
        const numNextAttrib = 2;
        for (let i = numNextAttrib; i < numPrevAttrib; i++) gl.disableVertexAttribArray(i);
        const vertexOffset = segment.vertexOffset || 0;
        gl.enableVertexAttribArray(this.aNormal);
        gl.enableVertexAttribArray(this.aHeight);
        gl.enableVertexAttribArray(this.aBase);
        bucket.layoutVertexBuffer.bind();
        if (this.tb.mapboxVersion >= 2) {
          gl.enableVertexAttribArray(this.aPosNormal);
          gl.vertexAttribPointer(this.aPosNormal, 4, gl.SHORT, false, 8, 8 * vertexOffset);
        } else {
          gl.enableVertexAttribArray(this.aPos);
          gl.vertexAttribPointer(this.aPos, 2, gl.SHORT, false, 12, 12 * vertexOffset);
          gl.vertexAttribPointer(this.aNormal, 4, gl.SHORT, false, 12, 4 + 12 * vertexOffset);
        }
        heightBuffer.bind();
        gl.vertexAttribPointer(this.aHeight, 1, gl.FLOAT, false, 4, 4 * vertexOffset);
        baseBuffer.bind();
        gl.vertexAttribPointer(this.aBase, 1, gl.FLOAT, false, 4, 4 * vertexOffset);
        bucket.indexBuffer.bind();
        context.currentNumAttributes = numNextAttrib;
        gl.drawElements(gl.TRIANGLES, segment.primitiveLength * 3, gl.UNSIGNED_SHORT, segment.primitiveOffset * 3 * 2);
      }
    }
  }
  _getVertexSource() {
    if (this.tb.mapboxVersion >= 2) {
      return `
				uniform mat4 u_matrix;
				uniform float u_height_factor;
				uniform float u_altitude;
				uniform float u_azimuth;
				attribute vec4 a_pos_normal_ed;
				attribute lowp vec2 a_base;
				attribute lowp vec2 a_height;
				void main() {
					float base = max(0.0, a_base.x);
					float height = max(0.0, a_height.x);

					vec3 pos_nx = floor(a_pos_normal_ed.xyz * 0.5);
					mediump vec3 top_up_ny = a_pos_normal_ed.xyz - 2.0 * pos_nx;
					float t = top_up_ny.x;
					vec4 pos = vec4(pos_nx.xy, t > 0.0 ? height : base, 1);

					float len = pos.z * u_height_factor / tan(u_altitude);
					pos.x += cos(u_azimuth) * len;
					pos.y += sin(u_azimuth) * len;
					pos.z = 0.0;
					gl_Position = u_matrix * pos;
				}
			`;
    } else {
      return `
				uniform mat4 u_matrix;
				uniform float u_height_factor;
				uniform float u_altitude;
				uniform float u_azimuth;
				attribute vec2 a_pos;
				attribute vec4 a_normal_ed;
				attribute lowp vec2 a_base;
				attribute lowp vec2 a_height;
				void main() {
					float base = max(0.0, a_base.x);
					float height = max(0.0, a_height.x);
					float t = mod(a_normal_ed.x, 2.0);
					vec4 pos = vec4(a_pos, t > 0.0 ? height : base, 1);
					float len = pos.z * u_height_factor / tan(u_altitude);
					pos.x += cos(u_azimuth) * len;
					pos.y += sin(u_azimuth) * len;
					pos.z = 0.0;
					gl_Position = u_matrix * pos;
				}
			`;
    }
  }
}
function Threebox(map, glContext, options2) {
  this.init(map, glContext, options2);
}
Threebox.prototype = {
  repaint: function() {
    this.map.repaint = true;
  },
  /**
   * Threebox constructor init method
   * @param {mapboxgl.map} map
   * @param {WebGLRenderingContext} glContext
   * @param {defaultOptions} options
   */
  init: function(map, glContext, options2) {
    this.options = utils._validate(options2 || {}, defaultOptions);
    this.map = map;
    this.map.tb = this;
    this.objects = new Objects();
    this.mapboxVersion = parseFloat(this.map.version);
    this.renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      preserveDrawingBuffer: options2.preserveDrawingBuffer,
      canvas: map.getCanvas(),
      context: glContext
    });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(this.map.getCanvas().clientWidth, this.map.getCanvas().clientHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.autoClear = false;
    this.labelRenderer = new LabelRenderer(this.map);
    this.scene = new THREE.Scene();
    this.world = new THREE.Group();
    this.world.name = "world";
    this.scene.add(this.world);
    this.objectsCache = /* @__PURE__ */ new Map();
    this.zoomLayers = [];
    this.fov = this.options.fov;
    this.orthographic = this.options.orthographic || false;
    this.raycaster = new THREE.Raycaster();
    this.raycaster.layers.set(0);
    this.mapCenter = this.map.getCenter();
    this.mapCenterUnits = utils.projectToWorld([this.mapCenter.lng, this.mapCenter.lat]);
    this.lightDateTime = /* @__PURE__ */ new Date();
    this.lightLng = this.mapCenter.lng;
    this.lightLat = this.mapCenter.lat;
    this.sunPosition;
    this.rotationStep = 5;
    this.gridStep = 6;
    this.altitudeStep = 0.1;
    this.defaultCursor = "default";
    this.lights = this.initLights;
    if (this.options.defaultLights) this.defaultLights();
    if (this.options.realSunlight) this.realSunlight(this.options.realSunlightHelper);
    this.skyLayerName = "sky-layer";
    this.terrainSourceName = "mapbox-dem";
    this.terrainExaggeration = 1;
    this.terrainLayerName = "";
    this.enableSelectingFeatures = this.options.enableSelectingFeatures || false;
    this.enableSelectingObjects = this.options.enableSelectingObjects || false;
    this.enableDraggingObjects = this.options.enableDraggingObjects || false;
    this.enableRotatingObjects = this.options.enableRotatingObjects || false;
    this.enableTooltips = this.options.enableTooltips || false;
    this.multiLayer = this.options.multiLayer || false;
    this.enableHelpTooltips = this.options.enableHelpTooltips || false;
    this.map.on("style.load", function() {
      this.tb.zoomLayers = [];
      if (this.tb.options.multiLayer) this.addLayer({
        id: "threebox_layer",
        type: "custom",
        renderingMode: "3d",
        map: this,
        onAdd: function(map2, gl) {
        },
        render: function(gl, matrix) {
          this.map.tb.update();
        }
      });
      this.once("idle", () => {
        this.tb.setObjectsScale();
      });
      if (this.tb.options.sky) {
        this.tb.sky = true;
      }
      if (this.tb.options.terrain) {
        this.tb.terrain = true;
      }
      let rasterLayers = ["satellite", "mapbox-mapbox-satellite", "satelliteLayer"];
      rasterLayers.forEach((l) => {
        if (this.getLayer(l)) this.tb.terrainLayerName = l;
      });
    });
    this.map.on("load", function() {
      this.selectedObject;
      this.selectedFeature;
      this.draggedObject;
      let draggedAction;
      this.overedObject;
      this.overedFeature;
      let canvas = this.getCanvasContainer();
      this.getCanvasContainer().style.cursor = this.tb.defaultCursor;
      let start;
      let startCoords = [];
      let lngDiff;
      let latDiff;
      let altDiff;
      let rotationDiff;
      function mousePos(e2) {
        var rect = canvas.getBoundingClientRect();
        return {
          x: e2.originalEvent.clientX - rect.left - canvas.clientLeft,
          y: e2.originalEvent.clientY - rect.top - canvas.clientTop
        };
      }
      this.unselectObject = function() {
        this.selectedObject.selected = false;
        this.selectedObject = null;
      };
      this.outObject = function() {
        this.overedObject.over = false;
        this.overedObject = null;
      };
      this.unselectFeature = function(f) {
        if (typeof f.id == "undefined") return;
        this.setFeatureState(
          { source: f.source, sourceLayer: f.sourceLayer, id: f.id },
          { select: false }
        );
        this.removeTooltip(f);
        f = this.queryRenderedFeatures({ layers: [f.layer.id], filter: ["==", ["id"], f.id] })[0];
        if (f) this.fire("SelectedFeatureChange", { detail: f });
        this.selectedFeature = null;
      };
      this.selectFeature = function(f) {
        this.selectedFeature = f;
        this.setFeatureState(
          { source: this.selectedFeature.source, sourceLayer: this.selectedFeature.sourceLayer, id: this.selectedFeature.id },
          { select: true }
        );
        this.selectedFeature = this.queryRenderedFeatures({ layers: [this.selectedFeature.layer.id], filter: ["==", ["id"], this.selectedFeature.id] })[0];
        this.addTooltip(this.selectedFeature);
        this.fire("SelectedFeatureChange", { detail: this.selectedFeature });
      };
      this.outFeature = function(f) {
        if (this.overedFeature && typeof this.overedFeature != "undefined" && this.overedFeature.id != f) {
          map.setFeatureState(
            { source: this.overedFeature.source, sourceLayer: this.overedFeature.sourceLayer, id: this.overedFeature.id },
            { hover: false }
          );
          this.removeTooltip(this.overedFeature);
          this.overedFeature = null;
        }
      };
      this.addTooltip = function(f) {
        if (!this.tb.enableTooltips) return;
        let coordinates = this.tb.getFeatureCenter(f);
        let t = this.tb.tooltip({
          text: f.properties.name || f.id || f.type,
          mapboxStyle: true,
          feature: f
        });
        t.setCoords(coordinates);
        this.tb.add(t, f.layer.id);
        f.tooltip = t;
        f.tooltip.tooltip.visible = true;
      };
      this.removeTooltip = function(f) {
        if (f.tooltip) {
          f.tooltip.visibility = false;
          this.tb.remove(f.tooltip);
          f.tooltip = null;
        }
      };
      map.onContextMenu = function(e2) {
        alert("contextMenu");
      };
      this.onClick = function(e2) {
        let intersectionExists;
        let intersects = [];
        if (map.tb.enableSelectingObjects) {
          intersects = this.tb.queryRenderedFeatures(e2.point);
        }
        intersectionExists = typeof intersects[0] == "object";
        if (intersectionExists) {
          let nearestObject = Threebox.prototype.findParent3DObject(intersects[0]);
          if (nearestObject) {
            if (this.selectedFeature) {
              this.unselectFeature(this.selectedFeature);
            }
            if (!this.selectedObject) {
              this.selectedObject = nearestObject;
              this.selectedObject.selected = true;
            } else if (this.selectedObject.uuid != nearestObject.uuid) {
              this.selectedObject.selected = false;
              nearestObject.selected = true;
              this.selectedObject = nearestObject;
            } else if (this.selectedObject.uuid == nearestObject.uuid) {
              this.unselectObject();
              return;
            }
            this.selectedObject.dispatchEvent({ type: "Wireframed", detail: this.selectedObject });
            this.selectedObject.dispatchEvent({ type: "IsPlayingChanged", detail: this.selectedObject });
            this.repaint = true;
            e2.preventDefault();
          }
        } else {
          let features = [];
          if (map.tb.enableSelectingFeatures) {
            features = this.queryRenderedFeatures(e2.point);
          }
          if (features.length > 0) {
            if (features[0].layer.type == "fill-extrusion" && typeof features[0].id != "undefined") {
              if (this.selectedObject) {
                this.unselectObject();
              }
              if (!this.selectedFeature) {
                this.selectFeature(features[0]);
              } else if (this.selectedFeature.id != features[0].id) {
                this.unselectFeature(this.selectedFeature);
                this.selectFeature(features[0]);
              } else if (this.selectedFeature.id == features[0].id) {
                this.unselectFeature(this.selectedFeature);
                return;
              }
            }
          }
        }
      };
      this.onMouseMove = function(e2) {
        let current = mousePos(e2);
        this.getCanvasContainer().style.cursor = this.tb.defaultCursor;
        if (e2.originalEvent.altKey && this.draggedObject) {
          if (!map.tb.enableRotatingObjects) return;
          draggedAction = "rotate";
          this.getCanvasContainer().style.cursor = "move";
          Math.min(start.x, current.x);
          Math.max(start.x, current.x);
          Math.min(start.y, current.y);
          Math.max(start.y, current.y);
          let rotation = { x: 0, y: 0, z: Math.round(rotationDiff[2] + ~~((current.x - start.x) / this.tb.rotationStep) % 360 * this.tb.rotationStep % 360) };
          this.draggedObject.setRotation(rotation);
          if (map.tb.enableHelpTooltips) this.draggedObject.addHelp("rot: " + rotation.z + "&#176;");
          return;
        }
        if (e2.originalEvent.shiftKey && this.draggedObject) {
          if (!map.tb.enableDraggingObjects) return;
          draggedAction = "translate";
          this.getCanvasContainer().style.cursor = "move";
          let coords = e2.lngLat;
          let options3 = [Number((coords.lng + lngDiff).toFixed(this.tb.gridStep)), Number((coords.lat + latDiff).toFixed(this.tb.gridStep)), this.draggedObject.modelHeight];
          this.draggedObject.setCoords(options3);
          if (map.tb.enableHelpTooltips) this.draggedObject.addHelp("lng: " + options3[0] + "&#176;, lat: " + options3[1] + "&#176;");
          return;
        }
        if (e2.originalEvent.ctrlKey && this.draggedObject) {
          if (!map.tb.enableDraggingObjects) return;
          draggedAction = "altitude";
          this.getCanvasContainer().style.cursor = "move";
          let now = e2.point.y * this.tb.altitudeStep;
          let options3 = [this.draggedObject.coordinates[0], this.draggedObject.coordinates[1], Number((-now - altDiff).toFixed(this.tb.gridStep))];
          this.draggedObject.setCoords(options3);
          if (map.tb.enableHelpTooltips) this.draggedObject.addHelp("alt: " + options3[2] + "m");
          return;
        }
        let intersectionExists;
        let intersects = [];
        if (map.tb.enableSelectingObjects) {
          intersects = this.tb.queryRenderedFeatures(e2.point);
        }
        intersectionExists = typeof intersects[0] == "object";
        if (intersectionExists) {
          let nearestObject = Threebox.prototype.findParent3DObject(intersects[0]);
          if (nearestObject) {
            this.outFeature(this.overedFeature);
            this.getCanvasContainer().style.cursor = "pointer";
            if (!this.selectedObject || nearestObject.uuid != this.selectedObject.uuid) {
              if (this.overedObject && this.overedObject.uuid != nearestObject.uuid) {
                this.outObject();
              }
              nearestObject.over = true;
              this.overedObject = nearestObject;
            } else if (this.selectedObject && nearestObject.uuid == this.selectedObject.uuid) {
              nearestObject.over = true;
              this.overedObject = nearestObject;
            }
            this.repaint = true;
            e2.preventDefault();
          }
        } else {
          if (this.overedObject) {
            this.outObject();
          }
          let features = [];
          if (map.tb.enableSelectingFeatures) {
            features = this.queryRenderedFeatures(e2.point);
          }
          if (features.length > 0) {
            this.outFeature(features[0]);
            if (features[0].layer.type == "fill-extrusion" && typeof features[0].id != "undefined") {
              if (!this.selectedFeature || this.selectedFeature.id != features[0].id) {
                this.getCanvasContainer().style.cursor = "pointer";
                this.overedFeature = features[0];
                this.setFeatureState(
                  { source: this.overedFeature.source, sourceLayer: this.overedFeature.sourceLayer, id: this.overedFeature.id },
                  { hover: true }
                );
                this.overedFeature = map.queryRenderedFeatures({ layers: [this.overedFeature.layer.id], filter: ["==", ["id"], this.overedFeature.id] })[0];
                this.addTooltip(this.overedFeature);
              }
            }
          }
        }
      };
      this.onMouseDown = function(e2) {
        if (!((e2.originalEvent.shiftKey || e2.originalEvent.altKey || e2.originalEvent.ctrlKey) && e2.originalEvent.button === 0 && this.selectedObject)) return;
        if (!map.tb.enableDraggingObjects && !map.tb.enableRotatingObjects) return;
        e2.preventDefault();
        map.getCanvasContainer().style.cursor = "move";
        map.once("mouseup", this.onMouseUp);
        this.draggedObject = this.selectedObject;
        start = mousePos(e2);
        startCoords = this.draggedObject.coordinates;
        rotationDiff = utils.degreeify(this.draggedObject.rotation);
        lngDiff = startCoords[0] - e2.lngLat.lng;
        latDiff = startCoords[1] - e2.lngLat.lat;
        altDiff = -this.draggedObject.modelHeight - e2.point.y * this.tb.altitudeStep;
      };
      this.onMouseUp = function(e2) {
        this.getCanvasContainer().style.cursor = this.tb.defaultCursor;
        this.off("mouseup", this.onMouseUp);
        this.off("mouseout", this.onMouseUp);
        this.dragPan.enable();
        if (this.draggedObject) {
          this.draggedObject.dispatchEvent({ type: "ObjectDragged", detail: { draggedObject: this.draggedObject, draggedAction } });
          this.draggedObject.removeHelp();
          this.draggedObject = null;
          draggedAction = null;
        }
      };
      this.onMouseOut = function(e2) {
        if (this.overedFeature) {
          let features = this.queryRenderedFeatures(e2.point);
          if (features.length > 0 && this.overedFeature.id != features[0].id) {
            this.getCanvasContainer().style.cursor = this.tb.defaultCursor;
            this.outFeature(features[0]);
          }
        }
      };
      this.onZoom = function(e2) {
        this.tb.zoomLayers.forEach((l) => {
          this.tb.toggleLayer(l);
        });
        this.tb.setObjectsScale();
      };
      let shiftDown = false;
      let ctrlKey = 17, cmdKey = 91, shiftKey = 16, sK = 83;
      function onKeyDown(e2) {
        if (e2.which === ctrlKey || e2.which === cmdKey) ;
        if (e2.which === shiftKey) shiftDown = true;
        let obj = this.selectedObject;
        if (shiftDown && e2.which === sK && obj) {
          let dc = utils.toDecimal;
          if (!obj.help) {
            let s = obj.modelSize;
            let sf = 1;
            if (obj.userData.units !== "meters") {
              sf = utils.projectedUnitsPerMeter(obj.coordinates[1]);
              if (!sf) {
                sf = 1;
              }
              sf = dc(sf, 7);
            }
            if (map.tb.enableHelpTooltips) obj.addHelp("size(m): " + dc(s.x / sf, 3) + " W, " + dc(s.y / sf, 3) + " L, " + dc(s.z / sf, 3) + " H");
            this.repaint = true;
          } else {
            obj.removeHelp();
          }
          return false;
        }
      }
      function onKeyUp(e2) {
        if (e2.which == ctrlKey || e2.which == cmdKey) ;
        if (e2.which === shiftKey) shiftDown = false;
      }
      this.on("click", this.onClick);
      this.on("mousemove", this.onMouseMove);
      this.on("mouseout", this.onMouseOut);
      this.on("mousedown", this.onMouseDown);
      this.on("zoom", this.onZoom);
      this.on("zoomend", this.onZoom);
      document.addEventListener("keydown", onKeyDown.bind(this), true);
      document.addEventListener("keyup", onKeyUp.bind(this));
    });
  },
  //[jscastro] added property to manage an athmospheric sky layer
  get sky() {
    return this.options.sky;
  },
  set sky(value) {
    if (value) {
      this.createSkyLayer();
    } else {
      this.removeLayer(this.skyLayerName);
    }
    this.options.sky = value;
  },
  //[jscastro] added property to manage an athmospheric sky layer
  get terrain() {
    return this.options.terrain;
  },
  set terrain(value) {
    this.terrainLayerName = "";
    if (value) {
      this.createTerrainLayer();
    } else {
      if (this.mapboxVersion < 2) {
        console.warn("Terrain layer are only supported by Mapbox-gl-js > v2.0");
        return;
      }
      if (this.map.getTerrain()) {
        this.map.setTerrain(null);
        this.map.removeSource(this.terrainSourceName);
      }
    }
    this.options.terrain = value;
  },
  //[jscastro] added property to manage FOV for perspective camera
  get fov() {
    return this.options.fov;
  },
  set fov(value) {
    if (this.camera instanceof THREE.PerspectiveCamera && this.options.fov !== value) {
      this.map.transform.fov = value;
      this.camera.fov = this.map.transform.fov;
      this.cameraSync.setupCamera();
      this.map.repaint = true;
      this.options.fov = value;
    }
  },
  //[jscastro] added property to manage camera type
  get orthographic() {
    return this.options.orthographic;
  },
  set orthographic(value) {
    const h = this.map.getCanvas().clientHeight;
    const w = this.map.getCanvas().clientWidth;
    if (value) {
      this.map.transform.fov = 0;
      this.camera = new THREE.OrthographicCamera(w / -2, w / 2, h / 2, h / -2, 0.1, 1e21);
    } else {
      this.map.transform.fov = this.fov;
      this.camera = new THREE.PerspectiveCamera(this.map.transform.fov, w / h, 0.1, 1e21);
    }
    this.camera.layers.enable(0);
    this.camera.layers.enable(1);
    this.cameraSync = new CameraSync(this.map, this.camera, this.world);
    this.map.repaint = true;
    this.options.orthographic = value;
  },
  //[jscastro] method to create an athmospheric sky layer
  createSkyLayer: function() {
    if (this.mapboxVersion < 2) {
      console.warn("Sky layer are only supported by Mapbox-gl-js > v2.0");
      this.options.sky = false;
      return;
    }
    let layer = this.map.getLayer(this.skyLayerName);
    if (!layer) {
      this.map.addLayer({
        "id": this.skyLayerName,
        "type": "sky",
        "paint": {
          "sky-opacity": [
            "interpolate",
            ["linear"],
            ["zoom"],
            0,
            0,
            5,
            0.3,
            8,
            1
          ],
          // set up the sky layer for atmospheric scattering
          "sky-type": "atmosphere",
          // explicitly set the position of the sun rather than allowing the sun to be attached to the main light source
          "sky-atmosphere-sun": this.getSunSky(this.lightDateTime),
          // set the intensity of the sun as a light source (0-100 with higher values corresponding to brighter skies)
          "sky-atmosphere-sun-intensity": 10
        }
      });
      this.map.once("idle", () => {
        this.setSunlight();
        this.repaint();
      });
    }
  },
  //[jscastro] method to create a terrain layer
  createTerrainLayer: function() {
    if (this.mapboxVersion < 2) {
      console.warn("Terrain layer are only supported by Mapbox-gl-js > v2.0");
      this.options.terrain = false;
      return;
    }
    let layer = this.map.getTerrain();
    if (!layer) {
      this.map.addSource(this.terrainSourceName, {
        "type": "raster-dem",
        "url": "mapbox://mapbox.mapbox-terrain-dem-v1",
        "tileSize": 512,
        "maxzoom": 14
      });
      this.map.setTerrain({ "source": this.terrainSourceName, "exaggeration": this.terrainExaggeration });
      this.map.once("idle", () => {
        this.cameraSync.updateCamera();
        this.repaint();
      });
    }
  },
  // Objects
  sphere: function(options2) {
    this.setDefaultView(options2, this.options);
    let obj = Sphere(options2, this.world);
    obj.threebox = this;
    return obj;
  },
  line: function(options2) {
    let obj = line(options2);
    obj.threebox = this;
    return obj;
  },
  label: function(options2) {
    let obj = Label(options2);
    obj.threebox = this;
    return obj;
  },
  tooltip: function(options2) {
    let obj = Tooltip(options2);
    obj.threebox = this;
    return obj;
  },
  tube: function(options2) {
    this.setDefaultView(options2, this.options);
    let obj = tube(options2, this.world);
    obj.threebox = this;
    return obj;
  },
  extrusion: function(options2) {
    this.setDefaultView(options2, this.options);
    let obj = extrusion(options2);
    obj.threebox = this;
    return obj;
  },
  Object3D: function(options2) {
    this.setDefaultView(options2, this.options);
    let obj = Object3D(options2);
    obj.threebox = this;
    return obj;
  },
  loadObj: async function loadObj$1(options2, cb) {
    this.setDefaultView(options2, this.options);
    const tb = this;
    if (options2.clone === false) {
      return new Promise(
        async (resolve) => {
          loadObj(options2, cb, async (obj) => {
            obj.threebox = tb;
            resolve(obj);
          });
        }
      );
    } else {
      let cache = this.objectsCache.get(options2.obj);
      if (cache) {
        cache.promise.then((obj) => {
          let dupe = obj.duplicate(options2);
          dupe.threebox = tb;
          cb(dupe);
        }).catch((err) => {
          this.objectsCache.delete(options2.obj);
          console.error("Could not load model file: " + options2.obj);
        });
      } else {
        this.objectsCache.set(options2.obj, {
          promise: new Promise(
            async (resolve, reject) => {
              loadObj(options2, cb, async (obj) => {
                obj.threebox = tb;
                if (obj.duplicate) {
                  resolve(obj.duplicate());
                } else {
                  reject(obj);
                }
              });
            }
          )
        });
      }
    }
  },
  // Material
  material: function(o2) {
    return material(o2);
  },
  initLights: {
    ambientLight: null,
    dirLight: null,
    dirLightBack: null,
    dirLightHelper: null,
    hemiLight: null,
    pointLight: null
  },
  utils,
  SunCalc,
  Constants: ThreeboxConstants,
  projectToWorld: function(coords) {
    return this.utils.projectToWorld(coords);
  },
  unprojectFromWorld: function(v3) {
    return this.utils.unprojectFromWorld(v3);
  },
  projectedUnitsPerMeter: function(lat) {
    return this.utils.projectedUnitsPerMeter(lat);
  },
  //get the center point of a feature
  getFeatureCenter: function getFeatureCenter2(feature, obj, level) {
    return utils.getFeatureCenter(feature, obj, level);
  },
  getObjectHeightOnFloor: function(feature, obj, level) {
    return utils.getObjectHeightOnFloor(feature, obj, level);
  },
  queryRenderedFeatures: function(point) {
    let mouse = new THREE.Vector2();
    mouse.x = point.x / this.map.transform.width * 2 - 1;
    mouse.y = 1 - point.y / this.map.transform.height * 2;
    this.raycaster.setFromCamera(mouse, this.camera);
    let intersects = this.raycaster.intersectObjects(this.world.children, true);
    return intersects;
  },
  //[jscastro] find 3D object of a mesh. this method is needed to know the object of a raycasted mesh
  findParent3DObject: function(mesh) {
    var result;
    mesh.object.traverseAncestors(function(m) {
      if (m.parent) {
        if (m.parent.type == "Group" && m.userData.obj) {
          result = m;
        }
      }
    });
    return result;
  },
  //[jscastro] method to replicate behaviour of map.setLayoutProperty when Threebox are affected
  setLayoutProperty: function(layerId, name, value) {
    this.map.setLayoutProperty(layerId, name, value);
    if (value !== null && value !== void 0) {
      if (name === "visibility") {
        this.world.children.filter((o2) => o2.layer === layerId).forEach((o2) => {
          o2.visibility = value;
        });
      }
    }
  },
  //[jscastro] Custom Layers doesn't work on minzoom and maxzoom attributes, and if the layer is including labels they don't hide either on minzoom
  setLayerZoomRange: function(layerId, minZoomLayer, maxZoomLayer) {
    if (this.map.getLayer(layerId)) {
      this.map.setLayerZoomRange(layerId, minZoomLayer, maxZoomLayer);
      if (!this.zoomLayers.includes(layerId)) this.zoomLayers.push(layerId);
      this.toggleLayer(layerId);
    }
  },
  //[jscastro] method to set the height of all the objects in a level. this only works if the objects have a geojson feature
  setLayerHeigthProperty: function(layerId, level) {
    let layer = this.map.getLayer(layerId);
    if (!layer) return;
    if (layer.type == "fill-extrusion") {
      let data = this.map.getStyle().sources[layer.source].data;
      let features = data.features;
      features.forEach(function(f) {
        f.properties.level = level;
      });
      this.map.getSource(layer.source).setData(data);
    } else if (layer.type == "custom") {
      this.world.children.forEach(function(obj) {
        let feature = obj.userData.feature;
        if (feature && feature.layer === layerId) {
          let location = this.tb.getFeatureCenter(feature, obj, level);
          obj.setCoords(location);
        }
      });
    }
  },
  //[jscastro] method to set globally all the objects that are fixedScale
  setObjectsScale: function() {
    this.world.children.filter((o2) => o2.fixedZoom != null).forEach((o2) => {
      o2.setObjectScale(this.map.transform.scale);
    });
  },
  //[jscastro] mapbox setStyle removes all the layers, including custom layers, so tb.world must be cleaned up too
  setStyle: function(styleId, options2) {
    this.clear().then(() => {
      this.map.setStyle(styleId, options2);
    });
  },
  //[jscastro] method to toggle Layer visibility checking zoom range
  toggleLayer: function(layerId, visible = true) {
    let l = this.map.getLayer(layerId);
    if (l) {
      if (!visible) {
        this.toggle(l.id, false);
        return;
      }
      let z = this.map.getZoom();
      if (l.minzoom && z < l.minzoom) {
        this.toggle(l.id, false);
        return;
      }
      if (l.maxzoom && z >= l.maxzoom) {
        this.toggle(l.id, false);
        return;
      }
      this.toggle(l.id, true);
    }
  },
  //[jscastro] method to toggle Layer visibility
  toggle: function(layerId, visible) {
    this.setLayoutProperty(layerId, "visibility", visible ? "visible" : "none");
    this.labelRenderer.toggleLabels(layerId, visible);
  },
  update: function(matrix) {
    if (this.map.repaint) this.map.repaint = false;
    var timestamp = Date.now();
    this.objects.animationManager.update(timestamp);
    this.updateLightHelper();
    this.renderer.resetState();
    const gl = this.renderer.getContext();
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    if (this.mapboxVersion >= 3) {
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LESS);
      gl.depthMask(true);
    }
    this.renderer.render(this.scene, this.camera);
    this.labelRenderer.render(this.scene, this.camera);
    if (this.options.passiveRendering === false) this.map.triggerRepaint();
  },
  add: function(obj, layerId, sourceId) {
    if (!this.enableTooltips && obj.tooltip) {
      obj.tooltip.visibility = false;
    }
    obj.threebox = this;
    this.world.add(obj);
    if (layerId) {
      obj.layer = layerId;
      obj.source = sourceId;
      let l = this.map.getLayer(layerId);
      if (l) {
        let v = l.visibility;
        let u = typeof v === "undefined";
        obj.visibility = u || v === "visible" ? true : false;
      }
    }
  },
  removeByName: function(name) {
    let obj = this.world.getObjectByName(name);
    if (obj) this.remove(obj);
  },
  remove: function(obj) {
    if (this.map.selectedObject && obj.uuid == this.map.selectedObject.uuid) this.map.unselectObject();
    if (this.map.draggedObject && obj.uuid == this.map.draggedObject.uuid) this.map.draggedObject = null;
    if (obj.dispose) obj.dispose();
    this.world.remove(obj);
    obj = null;
  },
  //[jscastro] this clears tb.world in order to dispose properly the resources
  clear: async function(layerId = null, dispose = false) {
    return new Promise((resolve, reject) => {
      let objects = [];
      this.world.children.forEach(function(object) {
        objects.push(object);
      });
      for (let i = 0; i < objects.length; i++) {
        let obj = objects[i];
        if (obj.layer === layerId || !layerId) {
          this.remove(obj);
        }
      }
      if (dispose) {
        this.objectsCache.forEach((value) => {
          value.promise.then((obj) => {
            obj.dispose();
            obj = null;
          });
        });
      }
      resolve("clear");
    });
  },
  //[jscastro] remove a layer clearing first the 3D objects from this layer in tb.world
  removeLayer: function(layerId) {
    this.clear(layerId, true).then(() => {
      this.map.removeLayer(layerId);
    });
  },
  //[jscastro] get the sun position (azimuth, altitude) from a given datetime, lng, lat
  getSunPosition: function(date, coords) {
    return SunCalc.getPosition(date || Date.now(), coords[1], coords[0]);
  },
  //[jscastro] get the sun times for sunrise, sunset, etc.. from a given datetime, lng, lat and alt
  getSunTimes: function(date, coords) {
    return SunCalc.getTimes(date, coords[1], coords[0], coords[2] ? coords[2] : 0);
  },
  //[jscastro] set shadows for fill-extrusion layers
  setBuildingShadows: function(options2) {
    if (this.map.getLayer(options2.buildingsLayerId)) {
      let layer = new BuildingShadows(options2, this);
      this.map.addLayer(layer, options2.buildingsLayerId);
    } else {
      console.warn("The layer '" + options2.buildingsLayerId + "' does not exist in the map.");
    }
  },
  //[jscastro] This method set the sun light for a given datetime and lnglat
  setSunlight: function(newDate = /* @__PURE__ */ new Date(), coords) {
    if (!this.lights.dirLight || !this.options.realSunlight) {
      console.warn("To use setSunlight it's required to set realSunlight : true in Threebox initial options.");
      return;
    }
    var date = new Date(newDate.getTime());
    if (coords) {
      if (coords.lng && coords.lat) this.mapCenter = coords;
      else this.mapCenter = { lng: coords[0], lat: coords[1] };
    } else {
      this.mapCenter = this.map.getCenter();
    }
    if (this.lightDateTime && this.lightDateTime.getTime() === date.getTime() && this.lightLng === this.mapCenter.lng && this.lightLat === this.mapCenter.lat) {
      return;
    }
    this.lightDateTime = date;
    this.lightLng = this.mapCenter.lng;
    this.lightLat = this.mapCenter.lat;
    this.sunPosition = this.getSunPosition(date, [this.mapCenter.lng, this.mapCenter.lat]);
    let altitude2 = this.sunPosition.altitude;
    let azimuth2 = Math.PI + this.sunPosition.azimuth;
    let radius = ThreeboxConstants.WORLD_SIZE / 2;
    let alt = Math.sin(altitude2);
    let altRadius = Math.cos(altitude2);
    let azCos = Math.cos(azimuth2) * altRadius;
    let azSin = Math.sin(azimuth2) * altRadius;
    this.lights.dirLight.position.set(azSin, azCos, alt);
    this.lights.dirLight.position.multiplyScalar(radius);
    this.lights.dirLight.intensity = Math.max(alt, 0) * 5;
    this.lights.hemiLight.intensity = Math.max(alt * 1, 0.1) * 3;
    this.lights.dirLight.updateMatrixWorld();
    this.updateLightHelper();
    if (this.map.loaded()) {
      this.updateSunGround(this.sunPosition);
      this.map.setLight({
        anchor: "map",
        position: [3, 180 + this.sunPosition.azimuth * 180 / Math.PI, 90 - this.sunPosition.altitude * 180 / Math.PI],
        intensity: Math.cos(this.sunPosition.altitude),
        //0.4,
        color: `hsl(40, ${50 * Math.cos(this.sunPosition.altitude)}%, ${Math.max(20, 20 + 96 * Math.sin(this.sunPosition.altitude))}%)`
      }, { duration: 0 });
      if (this.sky) {
        this.updateSunSky(this.getSunSky(date, this.sunPosition));
      }
    }
  },
  getSunSky: function(date, sunPos) {
    if (!sunPos) {
      var center = this.map.getCenter();
      sunPos = this.getSunPosition(
        date || Date.now(),
        [center.lng, center.lat]
      );
    }
    var sunAzimuth = 180 + sunPos.azimuth * 180 / Math.PI;
    var sunAltitude = 90 - sunPos.altitude * 180 / Math.PI;
    return [sunAzimuth, sunAltitude];
  },
  updateSunSky: function(sunPos) {
    if (this.sky) {
      this.map.setPaintProperty(this.skyLayerName, "sky-atmosphere-sun", sunPos);
    }
  },
  updateSunGround: function(sunPos) {
    if (this.terrainLayerName != "") {
      this.map.setPaintProperty(this.terrainLayerName, "raster-opacity", Math.max(Math.min(1, sunPos.altitude * 4), 0.25));
    }
  },
  //[jscastro] this updates the directional light helper
  updateLightHelper: function() {
    if (this.lights.dirLightHelper) {
      this.lights.dirLightHelper.position.setFromMatrixPosition(this.lights.dirLight.matrixWorld);
      this.lights.dirLightHelper.updateMatrix();
      this.lights.dirLightHelper.update();
    }
  },
  //[jscastro] method to fully dispose the resources, watch out is you call this without navigating to other page
  dispose: async function() {
    console.log(this.memory());
    return new Promise((resolve) => {
      resolve(
        this.clear(null, true).then((resolve2) => {
          this.map.remove();
          this.map = {};
          this.scene.remove(this.world);
          this.world.children = [];
          this.world = null;
          this.objectsCache.clear();
          this.labelRenderer.dispose();
          console.log(this.memory());
          this.renderer.dispose();
          return resolve2;
        })
      );
    });
  },
  defaultLights: function() {
    this.lights.ambientLight = new THREE.AmbientLight(new THREE.Color("hsl(0, 0%, 100%)"), 3);
    this.scene.add(this.lights.ambientLight);
    this.lights.dirLightBack = new THREE.DirectionalLight(new THREE.Color("hsl(0, 0%, 100%)"), 1);
    this.lights.dirLightBack.position.set(30, 100, 100);
    this.scene.add(this.lights.dirLightBack);
    this.lights.dirLight = new THREE.DirectionalLight(new THREE.Color("hsl(0, 0%, 100%)"), 1);
    this.lights.dirLight.position.set(-30, 100, -100);
    this.scene.add(this.lights.dirLight);
  },
  realSunlight: function(helper = false) {
    this.renderer.shadowMap.enabled = true;
    this.lights.dirLight = new THREE.DirectionalLight(16777215, 5);
    this.scene.add(this.lights.dirLight);
    if (helper) {
      this.lights.dirLightHelper = new THREE.DirectionalLightHelper(this.lights.dirLight, 5);
      this.scene.add(this.lights.dirLightHelper);
    }
    let d2 = 1e3;
    let r2 = 2;
    let mapSize2 = 8192;
    this.lights.dirLight.castShadow = true;
    this.lights.dirLight.shadow.radius = r2;
    this.lights.dirLight.shadow.mapSize.width = mapSize2;
    this.lights.dirLight.shadow.mapSize.height = mapSize2;
    this.lights.dirLight.shadow.camera.top = this.lights.dirLight.shadow.camera.right = d2;
    this.lights.dirLight.shadow.camera.bottom = this.lights.dirLight.shadow.camera.left = -d2;
    this.lights.dirLight.shadow.camera.near = 1;
    this.lights.dirLight.shadow.camera.visible = true;
    this.lights.dirLight.shadow.camera.far = 4e8;
    this.lights.hemiLight = new THREE.HemisphereLight(new THREE.Color(16777215), new THREE.Color(16777215), 3);
    this.lights.hemiLight.color.setHSL(0.661, 0.96, 0.12);
    this.lights.hemiLight.groundColor.setHSL(0.11, 0.96, 0.14);
    this.lights.hemiLight.position.set(0, 0, 50);
    this.scene.add(this.lights.hemiLight);
    this.setSunlight();
    this.map.once("idle", () => {
      this.setSunlight();
      this.repaint();
    });
  },
  setDefaultView: function(options2, defOptions) {
    options2.bbox = (options2.bbox || options2.bbox == null) && defOptions.enableSelectingObjects;
    options2.tooltip = (options2.tooltip || options2.tooltip == null) && defOptions.enableTooltips;
    options2.mapScale = this.map.transform.scale;
  },
  memory: function() {
    return this.renderer.info.memory;
  },
  programs: function() {
    return this.renderer.info.programs.length;
  },
  version: "2.2.7"
};
var defaultOptions = {
  defaultLights: false,
  realSunlight: false,
  realSunlightHelper: false,
  passiveRendering: true,
  preserveDrawingBuffer: false,
  enableSelectingFeatures: false,
  enableSelectingObjects: false,
  enableDraggingObjects: false,
  enableRotatingObjects: false,
  enableTooltips: false,
  enableHelpTooltips: false,
  multiLayer: false,
  orthographic: false,
  fov: ThreeboxConstants.FOV_DEGREES,
  sky: false,
  terrain: false
};
export {
  Threebox
};
//# sourceMappingURL=threebox.js.map
