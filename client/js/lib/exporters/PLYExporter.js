var Object3DUtil = require('geo/Object3DUtil');
var GeometryUtil = require('geo/GeometryUtil');
var FileUtil = require('io/FileUtil');
var _ = require('util');

/**
 * Export a mesh as PLY
 * @param options
 * @param options.fs File system to use for exporting (defaults to FileUtil)
 * @param [options.format='binary_little_endian'] {string} PLY file format.  Options are `ascii|binary_little_endian`.
 * @param [options.vertexAttributes=PLYExporter.VertexAttributes.rgbColor] {Object} Vertex attributes to export.
 * @constructor
 * @memberOf exporters
 */
function PLYExporter(options) {
  options = options || {};
  this.__fs = options.fs || FileUtil;
  //this.format = "ascii";
  this.format = options.format || 'binary_little_endian';
  this.vertexAttributes = options.vertexAttributes || [ PLYExporter.VertexAttributes.rgbColor ];
  this.includeChildModelInstances = false;
}

/* Predefined vertex attributes */
PLYExporter.VertexAttributes = {
  rgbColor: {
    name: 'color',
    stride: 3,
    properties: [
      {
        name: 'red',
        type: 'uchar',
        convert: function(v) {
          return Math.floor(v[0] * 255);
        }
      },
      {
        name: 'green',
        type: 'uchar',
        convert: function(v) {
          return Math.floor(v[1] * 255);
        }
      },
      {
        name: 'blue',
        type: 'uchar',
        convert: function(v) {
          return Math.floor(v[2] * 255);
        }
      }
    ]
  },
  // FIXME: Why are names inconsistent with property names? e.g. "Object" != "objectId".  Will need to fix Segments.colorSegments()
  // Segmentation types are upper case
  objectId: {
    name: 'Object',
    stride: 1,
    properties: [{
      name: 'objectId',
      type: 'uint16'
    }]
  },
  segmentId: {
    name: 'Segment',
    stride: 1,
    properties: [{
      name: 'segmentId',
      type: 'uint16'
    }]
  },
  categoryId: {
    name: 'Category',
    stride: 1,
    properties: [{
      name: 'categoryId',
      type: 'uint16'
    }]
  },
  labelId: {
    name: 'Label',
    stride: 1,
    properties: [{
      name: 'labelId',
      type: 'uint16'
    }]
  }
};

// Mapping of type to sizes
PLYExporter.TypeSizes = Object.freeze({
  'int8': 1,
  'uint8': 1,
  'char': 1,
  'uchar': 1,
  'int16': 2,
  'uint16': 2,
  'short': 2,
  'ushort': 2,
  'int32': 4,
  'uint32': 4,
  'int': 4,
  'uint': 4,
  'float32': 4,
  'float': 4,
  'float64': 8,
  'double': 8
});

PLYExporter.prototype.__computeProperties = function(opts) {
  // Figure out vertex and face properties and vertex and face sizes (in bytes)
  var vertexProps = [
    { name: 'x', type: 'float'},
    { name: 'y', type: 'float'},
    { name: 'z', type: 'float'}
  ];
  if (opts.vertexAttributes) {
    for (var i = 0; i < opts.vertexAttributes.length; i++) {
      var attr = opts.vertexAttributes[i];
      for (var j = 0; j < attr.properties.length; j++) {
        var prop = attr.properties[j];
        vertexProps.push(prop);
      }
    }
  }
  var vertSize = 0;
  for (var i = 0; i < vertexProps.length; i++) {
    var prop = vertexProps[i];
    prop.size = PLYExporter.TypeSizes[prop.type];
    if (prop.size) {
      vertSize += prop.size;
    } else {
      console.warn('No size for property ' + prop.name + ' of type ' + prop.type);
    }
  }
  opts.vertexProperties = vertexProps;
  opts.vertexSize = vertSize; // 3*4 bytes for position (float) + 3 bytes for (r,g,b)
  var faceProps = [{name: 'vertex_indices', type: 'list uchar int'}];
  opts.faceProperties = faceProps;
  opts.faceSize = 1 + 3*4; // 1 byte for face type, 3*4 (uint) bytes for vertex index
};

PLYExporter.prototype.__getHeader = function(opts) {
  var vertexProps = opts.vertexProperties.map(function(x) { return "property " + x.type + " " + x.name; });
  var faceProps = opts.faceProperties.map(function(x) { return "property " + x.type + " " + x.name; });
  var lines = ["ply", "format " + opts.format + " 1.0", "comment STK generated"]
    .concat(["element vertex " + opts.nverts])
    .concat(vertexProps)
    .concat(["element face " + opts.nfaces])
    .concat(faceProps)
    .concat(["end_header"]);
  return lines.join('\n') + '\n';
};


PLYExporter.prototype.exportMesh = function(mesh, opts) {
  opts = opts || {};
  var callback = opts.callback;
  var filename = (opts.name || 'scene');
  if (!filename.endsWith('.ply')) {
    filename = filename + '.ply';
  }
  mesh.updateMatrixWorld();
  var nverts = GeometryUtil.getGeometryVertexCount(mesh);
  var nfaces = GeometryUtil.getGeometryFaceCount(mesh);
  var params = _.defaults({ vertexOffset: 0, nverts: nverts, nfaces: nfaces }, opts,
    { format: this.format, vertexAttributes: this.vertexAttributes });
  this.__computeProperties(params);
  var header = this.__getHeader(params);
  var data = this.__appendMesh(mesh, params);
  var fileutil = this.__fs;
  function appendVertexData() {
    fileutil.fsAppendToFile(filename, data.getVertexData(), appendFaceData);
  }
  function appendFaceData() {
    fileutil.fsAppendToFile(filename, data.getFaceData(), finishFile);
  }
  function finishFile() {
    fileutil.fsExportFile(filename, filename);
    console.log('finished exporting mesh to ' + filename);
    if (callback) { callback(); }
  }
  fileutil.fsWriteToFile(filename, header, appendVertexData);
};

function __PlyAscii(opts) {
  this.v = [];
  this.f = [];
}
__PlyAscii.prototype.getVertexData = function() {
  return this.v.join('\n') + '\n';
};
__PlyAscii.prototype.getFaceData = function() {
  return this.f.join('\n') + '\n';
};
__PlyAscii.prototype.appendFace = function(verts) {
  var fs = verts.length + ' ' + verts.join(' ');
  this.f.push(fs);
};
__PlyAscii.prototype.appendVertex = function(v) {
  this.v.push(v.join(' '));
};


function __PlyBinary(opts) {
  this.isLittleEndian = (opts.format === 'binary_little_endian');
  this.opts = opts;
  var vertSize = opts.vertexSize;
  this.v = new ArrayBuffer(opts.nverts * vertSize);
  this.vdata = new DataView(this.v);
  this.voffset = 0;
  var faceSize = opts.faceSize;
  this.f = new ArrayBuffer(opts.nfaces * faceSize);
  this.fdata = new DataView(this.f);
  this.foffset = 0;
}
__PlyBinary.prototype.binaryWrite = function(dataview, value, at, type) {
  var little_endian = this.isLittleEndian;
  switch ( type ) {
    // correspondences for non-specific length types here match rply:
    case 'int8':    case 'char':   dataview.setInt8( at, value ); return 1;
    case 'uint8':   case 'uchar':  dataview.setUint8( at, value ); return 1;
    case 'int16':   case 'short':  dataview.setInt16( at, value, little_endian ); return 2;
    case 'uint16':  case 'ushort': dataview.setUint16( at, value, little_endian ); return 2;
    case 'int32':   case 'int':    dataview.setInt32( at, value, little_endian ); return 4;
    case 'uint32':  case 'uint':   dataview.setUint32( at, value, little_endian ); return 4;
    case 'float32': case 'float':  dataview.setFloat32( at, value, little_endian ); return 4;
    case 'float64': case 'double': dataview.setFloat64( at, value, little_endian ); return 8;
  }
};
__PlyBinary.prototype.getVertexData = function() {
  return this.v;
};
__PlyBinary.prototype.getFaceData = function() {
  return this.f;
};
__PlyBinary.prototype.appendFace = function(verts) {
  // Assumes 3 verts
  this.fdata.setUint8(this.foffset, 3); this.foffset++;
  this.fdata.setUint32(this.foffset, verts[0], this.isLittleEndian); this.foffset+=4;
  this.fdata.setUint32(this.foffset, verts[1], this.isLittleEndian); this.foffset+=4;
  this.fdata.setUint32(this.foffset, verts[2], this.isLittleEndian); this.foffset+=4;
};
__PlyBinary.prototype.appendVertex = function(v) {
  var props = this.opts.vertexProperties;
  for (var i = 0; i < props.length; i++) {
    var p = props[i];
    var d = this.binaryWrite(this.vdata, v[i], this.voffset, p.type);
    this.voffset += d;
  }
};


PLYExporter.prototype.__createData = function(opts) {
  if (opts.format === 'ascii') {
    return new __PlyAscii(opts);
  } else if (opts.format === 'binary_little_endian') {
    return new __PlyBinary(opts);
  } else {
    throw 'Unsupported PLY format: ' + opts.format;
  }
};

PLYExporter.prototype.__appendMesh = function (mesh, params, data) {
  var vertexOffset = params.vertexOffset;
  //console.log('appendMesh', JSON.stringify(params));

  var result = data || this.__createData(params);
  mesh.updateMatrixWorld();
  var t = mesh.matrixWorld;
  if (params.transform) {
    t = params.transform.clone();
    t.multiply(mesh.matrixWorld);
  }
  var vattrs = params.vertexAttributes;
  GeometryUtil.forMeshVerticesWithTransform(mesh, function (v, attrs) {
    var row = [v.x, v.y, v.z];
    if (attrs) {
      for (var i = 0; i < attrs.length; i++) {
        var attr = attrs[i];
        var props = vattrs[i].properties;
        for (var j = 0; j < props.length; j++) {
          var p = props[j];
          if (p.convert) {
            row.push(p.convert(attr));
          } else {
            row.push(attr);
          }
        }
      }
    }
    result.appendVertex(row);
  }, t, vattrs);

  var geometry = mesh.geometry;
  // Assumes faces are basically triangles
  //console.log(geometry);
  GeometryUtil.forFaceVertexIndices(geometry, function(iface, verts) {
    for (var i = 0; i < verts.length; i++) {
      verts[i] += vertexOffset;
    }
    result.appendFace(verts);
  });
  if (params) {
    params.vertexOffset = vertexOffset + GeometryUtil.getGeometryVertexCount(mesh.geometry);
  }
  return result;
};


PLYExporter.prototype.__appendObject = function (object3D, params, data, appendMeshCallback) {
  var result = data || this.__createData(params);
  object3D.updateMatrixWorld();
  Object3DUtil.traverseMeshes(object3D, !this.includeChildModelInstances, function(mesh) {
    appendMeshCallback(mesh, params, result);
  });
  return result;
};

PLYExporter.prototype.export = function (objects, opts) {
  opts = opts || {};
  var callback = opts.callback;
  // Exports object3D to file using OBJ format
  var filename = (opts.name || 'scene');
  if (!filename.endsWith('.ply')) {
    filename = filename + '.ply';
  }
  console.log('export to PLY');

  if (objects instanceof THREE.Object3D) {
    objects = [objects];
  }

  var nverts = 0;
  var nfaces = 0;
  for (var i = 0; i < objects.length; i++) {
    var stats = Object3DUtil.getObjectStats(objects[i], this.includeChildModelInstances);
    nverts += stats.nverts;
    nfaces += stats.nfaces;
  }

  var data = null;
  console.log('processing ' + objects.length + ' objects with total '
    + nverts + ' vertices, ' + nfaces + ' faces');
  var params = _.defaults({ vertexOffset: 0, nverts: nverts, nfaces: nfaces }, opts,
    { format: this.format, vertexAttributes: this.vertexAttributes });
  this.__computeProperties(params);
  for (var i = 0; i < objects.length; i++) {
    console.log('appending object ' + i + '/' + objects.length);
    data = this.__appendObject(objects[i], params, data, this.__appendMesh.bind(this));
  }
  var fileutil = this.__fs;
  function appendVertexData() {
    fileutil.fsAppendToFile(filename, data.getVertexData(), appendFaceData);
  }
  function appendFaceData() {
    fileutil.fsAppendToFile(filename, data.getFaceData(), finishFile);
  }
  function finishFile() {
    fileutil.fsExportFile(filename, filename);
    console.log('finished exporting mesh to ' + filename);
    if (callback) { callback(); }
  }
  var header = this.__getHeader(params);
  fileutil.fsWriteToFile(filename, header, appendVertexData);
};

module.exports = PLYExporter;