"use strict";
const ASSERT = (cond) => {
	if (!cond) throw new Error("assertion failed!");
};
class Vec3 {
	constructor(x, y, z) {
		this.x=x; this.y=y; this.z=z;
	}
	toString() {
		return `Vec3(${this.x}, ${this.y}, ${this.z})`;
	}
	valid() {
		return !(isNaN(this.x) || isNaN(this.y) || isNaN(this.z));
	}
	len() {
		return Math.sqrt(this.x*this.x + this.y*this.y + this.z*this.z);
	}
	round() {
		this.x = Math.round(this.x);
		this.y = Math.round(this.y);
		this.z = Math.round(this.z);
		return this;
	}
	div(c) {
		this.x /= c; this.y /= c; this.z /= c;
		return this;
	}
	static sub(a, b) {
		return new Vec3(
			a.x - b.x,
			a.y - b.y,
			a.z - b.z,
		);
	}
	static cross(a, b) {
		return new Vec3(
			a.y*b.z - a.z*b.y,
			a.z*b.x - a.x*b.z,
			a.x*b.y - a.y*b.x,
		);
	}
	static dot(a, b) {
		return a.x*b.x + a.y*b.y + a.z*b.z;
	}
	barycentric(pts) {
		const u = Vec3.cross(
			new Vec3(pts[2].x-pts[0].x, pts[1].x-pts[0].x, pts[0].x-this.x),
			new Vec3(pts[2].y-pts[0].y, pts[1].y-pts[0].y, pts[0].y-this.y),
		);
		if (Math.abs(u.z < 1)) return new Vec3(-1, 1, 1);
		return new Vec3(1 - (u.x+u.y)/u.z, u.y/u.z, u.x/u.z);
	}
	static normal(v0, v1, v2) {
		const ax = v2.x - v0.x, ay = v2.y - v0.y, az = v2.z - v0.z;
		const bx = v1.x - v0.x, by = v1.y - v0.y, bz = v1.z - v0.z;
		return new Vec3(
			ay*bz - az*by,
			az*bx - ax*bz,
			ax*by - ay*bx,
		);
	}
}
class Matrix4x4 {
	constructor(
		xx, xy, xz, tx,
		yx, yy, yz, ty,
		zx, zy, zz, tz,
	) {
		this.xx=xx; this.xy=xy; this.xz=xz; this.tx=tx;
		this.yx=yx; this.yy=yy; this.yz=yz; this.ty=ty;
		this.zx=zx; this.zy=zy; this.zz=zz; this.tz=tz;
	}
	static identity() {
		return new Matrix4x4(1,0,0,0,0,1,0,0,0,0,1,0);
	}
	apply(v) {
		return new Vec3(
			v.x*this.xx + v.y*this.xy + v.z*this.xz + this.tx,
			v.x*this.yx + v.y*this.yy + v.z*this.yz + this.ty,
			v.x*this.zx + v.y*this.zy + v.z*this.zz + this.tz,
		)
	}
}

class InputHandler {
	constructor(element) {
		element.setAttribute("tabindex", "1");
		element.focus();
		this.mouseState = [];
		this.cursor = new Vec3(0, 0, 0);
		element.addEventListener("mousedown", (evt) => {
			this.mouseState[evt.button] = true;
		});
		element.addEventListener("mouseup", (evt) => {
			this.mouseState[evt.button] = false;
		});
		element.addEventListener("mousemove", (evt) => {
			this.cursor.x = evt.offsetX;
			this.cursor.y = evt.offsetY;
		})
		element.addEventListener("contextmenu", (evt) => {
			evt.preventDefault();
		});
		this.keyboardState = {};
		element.addEventListener("keydown", (evt) => {
			this.keyboardState[evt.code] = true;
		});
		element.addEventListener("keyup", (evt) => {
			this.keyboardState[evt.code] = false;
		});
	}
	mouse(key) {
		return !!this.mouseState[key];
	}
	keyboard(key) {
		return !!this.keyboardState[key];
	}
}

const RenderMode = {
	NONE: "NONE",
	WIREFRAME: "WIREFRAME",
	ZBUFFER: "ZBUFFER",
	BARYCENTRIC: "BARYCENTRIC",
	NORMALS: "NORMALS",
	TEXTURE: "TEXTURE",
	PHONG: "PHONG",
	FULL: "FULL",
}

class Canvas {
	constructor(element, width, height, scaling=1) {
		this.element = element
		this.width  = this.element.width  = 0|(width/scaling);
		this.height = this.element.height = 0|(height/scaling);
		element.style.width  = `${scaling * this.width }px`;
		element.style.height = `${scaling * this.height}px`;
		element.style.imageRendering = "pixelated";
		this.scaling = scaling;
		this.context = this.element.getContext("2d");
		this.image = this.context.createImageData(this.width, this.height);
		this.element.style.backgroundColor = "black";
		this.zbuffer = new Float32Array(this.width*this.height);
		this.renderMode = RenderMode.FULL;
		this.fontSize = 22;
		this.debugTexts = [];
		this.imageDataClear = new Uint32Array(this.image.data.buffer);
		this.zbufferClear = new Uint32Array(this.zbuffer.buffer);
		this.lightDir = new Vec3(0, 0, -1);
		this.transform = Matrix4x4.identity();
		this.input = new InputHandler(element);
	}
	_idx(x, y) {
		return (0|y)*(this.width<<2) + (x<<2);
	};
	set(x, y, rgba) {
		const i = this._idx(x, y);
		const data = this.image.data;
		data[i  ] = rgba[0];
		data[i+1] = rgba[1];
		data[i+2] = rgba[2];
		data[i+3] = rgba[3];
		//data.set(rgba, i); // Slower on Chrome/Firefox/Safari.
	}
	get(x, y) {
		const i = this._idx(x, y);
		const data = this.image.data;
		return [
			data[i  ],
			data[i+1],
			data[i+2],
			data[i+3],
		];
	}
	present() {
		this.context.putImageData(this.image, 0, 0);

		if (this.debugTexts.length > 0) {
			this.context.fillStyle = "#00ff00";
			this.context.font = `${this.fontSize/this.scaling}px monospace`;
			for (let i=0; i < this.debugTexts.length; ++i) {
				const x = 10, y = 5 + (1+i)*this.fontSize;
				const text = this.debugTexts[i];
				this.context.fillText(text, x/this.scaling, y/this.scaling);
			}
			this.debugTexts.length = 0;
		}
	}
	debugText(text) {
		this.debugTexts.push(text);
	}
	showError(error) {
		this.present(); // Show partial buffer.
		this.context.fillStyle = "#ff0000";
		this.context.font = `${this.fontSize/this.scaling}px monospace`;
		const x = 10, y = 5 + this.fontSize;
		this.context.fillText(error.toString(), x/this.scaling, y/this.scaling);
	}
	clear() {
		// Faster than fill on Firefox & Safari.
		// Only slightly slower on Chrome.
		for (let i = 0; i < this.imageDataClear.length; ++i) {
			this.imageDataClear[i] = 0;
			this.zbufferClear[i] = 0;
		}
		//this.zbuffer.fill(0);
		//this.image.data.fill(0);

		// Debug magenta fill to find holes:
		//this.context.fillStyle = "#ff00ff";
		//this.context.fillRect(0, 0, this.width, this.height);
		//this.image = this.context.getImageData(0, 0, this.width, this.height);
	}
	line(x0, y0, x1, y1, rgba) { // Bresenham's line algorithm.
		const dx =  Math.abs(x1 - x0), sx = Math.sign(x1 - x0);
		const dy = -Math.abs(y1 - y0), sy = Math.sign(y1 - y0);
		let error = dx + dy;
		while (true) {
			this.set(x0, y0, rgba);
			if (x0 === x1 && y0 === y1) return;
			const e2 = 2*error;
			if (e2 >= dy) { error += dy; x0 += sx; }
			if (e2 <= dx) { error += dx; y0 += sy; }
		}
	}
	triangle(x0,y0, x1,y1, x2,y2, rgba) {
		canvas.line(x0,y0, x1,y1, rgba);
		canvas.line(x1,y1, x2,y2, rgba);
		canvas.line(x2,y2, x0,y0, rgba);
	}
	triangle3d(face, tex, percent, rng) {
		let w0 = this.transform.apply(face.vertices[0]).round();
		let w1 = this.transform.apply(face.vertices[1]).round();
		let w2 = this.transform.apply(face.vertices[2]).round();
		if (w0.y === w1.y && w0.y === w2.y) return; // Degenerate.

		const Px = w2.x - w0.x, Py = w1.x - w0.x;
		const Qx = w2.y - w0.y, Qy = w1.y - w0.y;
		const uz = Px*Qy - Py*Qx;
		if (this.renderMode === RenderMode.WIREFRAME) {
			const a = uz < 0 ? 255 : 127;
			this.triangle(w0.x,w0.y, w1.x,w1.y, w2.x,w2.y, [255*percent,255*(1-percent),0,a]);
			return;
		}
		if (uz >= 0) {
			return;
		}

		const w0x = w0.x, w0y = w0.y;
		if (w0.y > w1.y) [w0, w1] = [w1, w0];
		if (w0.y > w2.y) [w0, w2] = [w2, w0];
		if (w1.y > w2.y) [w1, w2] = [w2, w1];
		const depth = Math.max(w0.z, w1.z, w2.z);

		const data = this.image.data;
		const zbuffer = this.zbuffer;

		const lx = this.lightDir.x, ly = this.lightDir.y, lz = this.lightDir.z;
		const t0x = face.texture[0].x, t1x = face.texture[1].x, t2x = face.texture[2].x;
		const t0y = face.texture[0].y, t1y = face.texture[1].y, t2y = face.texture[2].y;
		const n0x = face.normals[0].x, n1x = face.normals[1].x, n2x = face.normals[2].x;
		const n0y = face.normals[0].y, n1y = face.normals[1].y, n2y = face.normals[2].y;
		const n0z = face.normals[0].z, n1z = face.normals[1].z, n2z = face.normals[2].z;

		const heightAll = w2.y - w0.y;
		const heightTop = w1.y - w0.y;
		const heightBot = w2.y - w1.y;
		for (let dy = 0; dy < heightAll; ++dy) {
			let x = w0.x + dy * ((w2.x - w0.x) / heightAll);
			let y = w0.y + dy;
			let x1;
			if (dy < heightTop) {
				x1 = w0.x + ((w1.x - w0.x) / heightTop) * dy;
			} else {
				x1 = w1.x + ((w2.x - w1.x) / heightBot) * (dy-heightTop);
			}
			if (x > x1) [x, x1] = [x1, x];
			x = Math.ceil(x);
			x1 = Math.floor(x1);

			const Qz = w0y - y;
			for (let j = y*this.width + x; x <= x1; ++x, ++j) {
				if (depth > zbuffer[j]) {
					const Pz = w0x - x;
					const ux = Py*Qz - Pz*Qy, uy = Pz*Qx - Px*Qz;
					const b0 = 1 - (ux + uy)/uz, b1 = uy/uz, b2 = ux/uz;
					if (b0 >= 0 && b1 >= 0 && b2 >= 0) {
						zbuffer[j] = depth;
						const i = j << 2;
						const nx = (b0*n0x + b1*n1x + b2*n2x);
						const ny = (b0*n0y + b1*n1y + b2*n2y);
						const nz = (b0*n0z + b1*n1z + b2*n2z);
						const intensity = nx*lx + ny*ly - nz*lz;
						const tx = (b0*t0x + b1*t1x + b2*t2x);
						const ty = (b0*t0y + b1*t1y + b2*t2y);
						const ti = ((1-ty)*1024<<2)*1024 + (tx*1024<<2);
						if (this.renderMode == RenderMode.FULL) {
							data[i  ] = tex.data[ti+0]*intensity;
							data[i+1] = tex.data[ti+1]*intensity;
							data[i+2] = tex.data[ti+2]*intensity;
						} else if (this.renderMode === RenderMode.PHONG) {
							data[i  ] = 255*intensity;
							data[i+1] = 255*intensity;
							data[i+2] = 255*intensity;
						} else if (this.renderMode == RenderMode.TEXTURE) {
							data[i  ] = 255*tx;
							data[i+1] = 255*ty;
							data[i+2] = 255*(1 - tx);
						} else if (this.renderMode === RenderMode.NORMALS) {
							data[i  ] = 255*Math.sqrt(Math.abs(nx));
							data[i+1] = 255*Math.sqrt(Math.abs(ny));
							data[i+2] = 255*Math.sqrt(Math.abs(nz));
						} else if (this.renderMode === RenderMode.BARYCENTRIC) {
							data[i  ] = 255*b0*b0*b0;
							data[i+1] = 255*b1*b1*b1;
							data[i+2] = 255*b2*b2*b2;
						} else if (this.renderMode === RenderMode.ZBUFFER) {
							const gray = Math.pow(depth, 2) * (255/1000000)
							data[i  ] = gray;
							data[i+1] = gray;
							data[i+2] = gray;
						}
						data[i+3] = 255;
					}
				} else if (this.renderMode === RenderMode.ZBUFFER) {
					zbuffer[j] = Number.POSITIVE_INFINITY;
					const i = j << 2;
					data[i  ] = data[i+1];
					data[i+1] = data[i+2];
					data[i+2] = data[i+3];
				}
			}
		}
	}
	renderObj(obj, tex, rnggen) {
		if (this.renderMode === RenderMode.NONE) {
			return;
		}
		for (const [group, faces] of obj) {
			const rng = rnggen(group);
			for (const [i, face] of faces.entries()) {
				canvas.triangle3d(face, tex, i/faces.length, rng);
			}
		}
	}
}

const parseObj = (text) => {
	const obj = { v: [], vt: [], vn: [], f: new Map() };
	let group;
	text.split("\n").forEach((line, lineNumber) => {
		line = line.replace(/#.*$/, ""); // Comments.
		if (line.length === 0) return;
		const entry = line.trim().split(/\s+/);
		const command = entry.shift();
		switch (command) {
			case "v": // Geometric vertices.
			case "vn": // Vertex normals.
			case "vt": // Texture vertices.
				obj[command].push(new Vec3(...entry.map((f) => parseFloat(f))));
				break;
			case "f": // Face.
				group.push(entry.map((t) => {
					return t.split("/").map((i) => parseInt(i, 10) - 1);
				}));
				break;
			case "g": // Group name.
				const groupName = entry.shift();
				if (!groupName) {
					throw new Error(`Missing group name at line ${lineNumber}`);
				}
				if (!obj.f.has(groupName)) {
					obj.f.set(groupName, group = []);
				}
				break;
			case "s": // Smoothing group.
				break; // Ignored.
			default:
				throw new Error(`Unsupported or invalid command: '${command || ""}' at line ${lineNumber}`);
		}
	});
	const faces = [...obj.f.values()].reduce((total, list) => total + list.length, 0);
	console.log(`Vertices: ${obj.v.length} // Triangles: ${faces}`)
	return obj;
};
const bakeObj = (rawObj) => {
	const obj = new Map();
	for (const [groupName, groupData] of rawObj.f.entries()) {
		const faces = groupData.map((rawFace) => {
			return {
				vertices: rawFace.map((triplet) => rawObj.v[triplet[0]]),
				texture:  rawFace.map((triplet) => rawObj.vt[triplet[1]]),
				normals:  rawFace.map((triplet) => rawObj.vn[triplet[2]]),
			}
		});
		obj.set(groupName, faces);
	}
	return obj;
};

const element = document.getElementById("renderer");
const canvas = new Canvas(element, 800, 600, 1);

const animate = (chunk) => {
	return new Promise((_, reject) => {
		let dt = 1000/60;
		requestAnimationFrame(function tick() {
			try {
				const t = performance.now();
				canvas.clear();
				chunk(t/1000, dt);
				canvas.present();
				requestAnimationFrame(tick);
				dt = performance.now() - t;
			} catch (err) {
				reject(err);
			}
		});
	});
};

const xmur = (str) => {
	let h = 1779033703 ^ str.length;
	for (let i = 0; i < str.length; ++i) {
		h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
		h = h << 13 | h >>> 19;
	}
	return () => {
		h = Math.imul(h ^ (h >>> 16), 2246822507);
		h = Math.imul(h ^ (h >>> 13), 3266489909);
		return (h ^= h >>> 16) & 255;
	};
};

const createOffscreenCanvas = (w, h) => {
	if (window.OffscreenCanvas) {
		return new OffscreenCanvas(w, h);
	}
	const e = document.createElement("canvas");
	e.width = w; e.height = h;
	return e;
};

const loadObj = (src) => {
	return fetch(src)
		.then((body) => {
			if (body.ok) {
				return body.text()
			} else {
				throw new Error(`${body.statusText}: ${src}`);
			}
		})
		.then((text) => parseObj(text))
		.then((raw) => bakeObj(raw));
}

const loadImage = (src) => new Promise((resolve, reject) => {
	const img = new Image();
	img.onload = (evt) => {
		const canvas = createOffscreenCanvas(img.width, img.height);
		const ctx = canvas.getContext("2d");
		ctx.drawImage(img, 0, 0);
		resolve(ctx.getImageData(0, 0, img.width, img.height));
	};
	img.onerror = (evt) => {
		reject(new Error(`File not found: ${src}`));
	};
	img.src = src;
});

const headObj = loadObj("head.obj")
const headTex = loadImage("diffuse.png");

Promise.all([headObj, headTex]).then(([obj, tex]) => {
	const hw = canvas.width / 2;
	const hh = canvas.height / 2;
	const sf = 0.9*Math.min(hh, hw);
	const ox = hw, oy = hh;
	let isRotating = true;
	let avgDT = 0;
	const dts = new Array(120).fill(0);
	return animate((t, dt) => {
		const fps = 1000 / avgDT;
		avgDT = 0.9*avgDT + 0.1*dt;
		dts.pop();
		dts.unshift(dt);
		for (let i=0; i < dts.length; ++i) {
			const dt = dts[i]/1000;
			const v = Math.max(0, Math.min(1, (dt-1/60)/(1/30-1/60)));
			let j = Math.floor(1000*dt);
			while (j --> 0) canvas.set(canvas.width-10-i, 10+j, [255*v,255*(1-v),255-255/30*j,255]);
		}

		canvas.debugText(`${fps.toFixed(0).padStart(3)} FPS`);
		canvas.debugText(`${avgDT.toFixed(3).padStart(6)} ms`);

		if (canvas.input.keyboard("Digit0")) {
			canvas.renderMode = RenderMode.NONE;
		} else if (canvas.input.keyboard("Digit1")) {
			canvas.renderMode = RenderMode.WIREFRAME;
		} else if (canvas.input.keyboard("Digit2")) {
			canvas.renderMode = RenderMode.ZBUFFER;
		} else if (canvas.input.keyboard("Digit3")) {
			canvas.renderMode = RenderMode.BARYCENTRIC;
		} else if (canvas.input.keyboard("Digit4")) {
			canvas.renderMode = RenderMode.NORMALS;
		} else if (canvas.input.keyboard("Digit5")) {
			canvas.renderMode = RenderMode.TEXTURE;
		} else if (canvas.input.keyboard("Digit6")) {
			canvas.renderMode = RenderMode.PHONG;
		} else if (canvas.input.keyboard("Digit7")) {
			canvas.renderMode = RenderMode.FULL;
		}

		if (canvas.renderMode !== RenderMode.FULL) {
			canvas.debugText(`mode: ${canvas.renderMode.toString()}`);
		}

		if (canvas.input.keyboard("KeyF")) {
			isRotating = false;
		}

		const lightAng = isRotating ? t : 0;
		canvas.lightDir = new Vec3(Math.sin(lightAng), 0, -Math.cos(lightAng));
		canvas.lightDir.div(canvas.lightDir.len());

		const headAng = Math.PI + (isRotating ? Math.cos(t/11) : 0);
		const cos = Math.cos(headAng), sin = Math.sin(headAng);
		canvas.transform = new Matrix4x4(
			sf*cos , 0      , sf*sin  , ox ,
			0      , -sf    , 0       , oy ,
			sf*sin , 0      , -sf*cos , ox ,
		)
		canvas.renderObj(obj, tex, xmur);
	});
}).catch((err) => {
	canvas.showError(err);
});
