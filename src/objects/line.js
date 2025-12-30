/**
 * @author peterqliu / https://github.com/peterqliu
 * @author jscastro / https://github.com/jscastro76
 */
import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import utils from '../utils/utils.js';
import Objects from './objects.js';

function line(obj){

	obj = utils._validate(obj, Objects.prototype._defaults.line);

	// Geometry
    var straightProject = utils.lnglatsToWorld(obj.geometry);
	var normalized = utils.normalizeVertices(straightProject);
    var flattenedArray = utils.flattenVectors(normalized.vertices);

	var geometry = new LineGeometry();
	geometry.setPositions( flattenedArray );

	// Material
	let matLine = new LineMaterial( {
		color: obj.color,
		linewidth: obj.width, // in pixels
		dashed: false,
		opacity: obj.opacity
	} );

	matLine.resolution.set( window.innerWidth, window.innerHeight );
	matLine.isMaterial = true;
	matLine.transparent = true;
	matLine.depthWrite = false;

	// Mesh
	let lineObj = new Line2( geometry, matLine );
	lineObj.position.copy(normalized.position)
	lineObj.computeLineDistances();

	return lineObj
}

export default line;
