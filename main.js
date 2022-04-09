"use strict";
const ASSERT = (cond) => {
	if (!cond) throw new Error("assertion failed!");
};
class Vec3 extends Array {
	len() {
		return Math.sqrt(this[0]*this[0] + this[1]*this[1] + this[2]*this[2]);
	}
	round() {
		this[0] = Math.round(this[0]);
		this[1] = Math.round(this[1]);
		this[2] = Math.round(this[2]);
		return this;
	}
	div(c) {
		this[0] /= c;
		this[1] /= c;
		this[2] /= c;
		return this;
	}
	static sub(a, b) {
		return new Vec3(
			a[0] - b[0],
			a[1] - b[1],
			a[2] - b[2],
		);
	}
	static cross(a, b) {
		return new Vec3(
			a[1]*b[2] - a[2]*b[1],
			a[2]*b[0] - a[0]*b[2],
			a[0]*b[1] - a[1]*b[0],
		);
	}
	static dot(a, b) {
		return a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
	}
	barycentric(pts) {
		const u = Vec3.cross.apply(
			[ pts[2][0]-pts[0][0], pts[1][0]-pts[0][0], pts[0][0]-this[0] ],
			[ pts[2][1]-pts[0][1], pts[1][1]-pts[0][1], pts[0][1]-this[1] ],
		);
		if (Math.abs(u[2] < 1)) return [-1,1,1];
		return [ 1 - (u[0]+u[1])/u[2], u[1]/u[2], u[0]/u[2] ];
	}
}
class Matrix4x4 extends Array {
	// xx, xy, xz, tz
	// yx, yy, yz, ty
	// zx, zy, zz, tz
	static apply(m, a) {
		return new Vec3(
			a[0]*m[ 0] + a[1]*m[ 1] + a[2]*m[ 2] + m[ 3],
			a[0]*m[ 4] + a[1]*m[ 5] + a[2]*m[ 6] + m[ 7],
			a[0]*m[ 8] + a[1]*m[ 9] + a[2]*m[10] + m[11],
		)
	}
}

class Canvas {
	constructor(element, width, height, scaling) {
		this.element = element
		element.style.width  = `${scaling * width }px`;
		element.style.height = `${scaling * height}px`;
		this.width = this.element.width = width;
		this.height = this.element.height = height;
		this.scaling = scaling;
		this.context = this.element.getContext("2d");
		this.image = this.context.createImageData(this.width, this.height);
		this.element.style.backgroundColor = "black";
		this.zbuffer = new Float32Array(this.width*this.height);
		this.debugMode = null;
	}
	_idx(x, y) {
		return (y|0)*(this.width<<2) + (x<<2);
	};
	set(x, y, rgba) {
		const i = this._idx(x, y);
		const data = this.image.data;
		data[i  ] = rgba[0];
		data[i+1] = rgba[1];
		data[i+2] = rgba[2];
		data[i+3] = rgba[3];
		//data.set(rgba, i); // Slower.
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
	present(fps) {
		this.context.putImageData(this.image, 0, 0);
		if (fps) {
			this.context.fillStyle = "#00ff00";
			this.context.font = `${22/this.scaling}px Arial`;
			this.context.fillText(`${fps} FPS`, 10/this.scaling, (5 + 22)/this.scaling);
		}
	}
	clear() {
		this.image.data.fill(0);
		let i = this.width*this.height;
		while (i > 0) this.zbuffer[--i] = 0; // Faster in Firefox?
		//this.zbuffer.fill(0);
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
	_scanLine(y, x0, x1, rgba, depth) {
		if (x0 > x1) [x0, x1] = [x1, x0];
		const i0 = this._idx(x0, y);
		const i1 = i0 + ((x1 - x0)*4);
		const data = this.image.data;
		const zbuffer = this.zbuffer;
		let j = Math.floor(y*this.width + x0);
		for (let i = i0; i <= i1; i+=4, ++j) {
			if (depth > zbuffer[j]) {
				zbuffer[j] = depth;
				if (!this.debugMode) {
					data[i  ] = rgba[0];
					data[i+1] = rgba[1];
					data[i+2] = rgba[2];
					data[i+3] = rgba[3];
				} else if (this.debugMode === "zbuffer") {
					data[i  ] = Math.pow(depth, 2) * (255/1000000);
					data[i+1] = Math.pow(depth, 2) * (255/1000000);
					data[i+2] = Math.pow(depth, 2) * (255/1000000);
					data[i+3] = 255;
				}
			}
		}
	}
	triangle3d(w0, w1, w2, rgba, renderOpts) {
		if (w0[1] === w1[1] && w0[1] === w2[1]) return; // Degenerate.
		const n = Vec3.cross(Vec3.sub(w2, w0), Vec3.sub(w1, w0));
		const i = Vec3.dot(renderOpts.lightDir, n) / n.len();
		if (this.debugMode === "wireframe") {
			this.triangle(w0[0],w0[1], w1[0],w1[1], w2[0],w2[1], [255,255,255,i >= 0 ? 255 : 127]);
			return;
		}
		if (i < 0) {
			return;
		}
		const rgbaI = [rgba[0]*i, rgba[1]*i, rgba[2]*i, rgba[3]];
		if (w0[1] > w1[1]) [w0, w1] = [w1, w0];
		if (w0[1] > w2[1]) [w0, w2] = [w2, w0];
		if (w1[1] > w2[1]) [w1, w2] = [w2, w1];
		const depth = Math.max(w0[2], w1[2], w2[2]);

		const heightAll = w2[1] - w0[1];
		const heightTop = w1[1] - w0[1];
		for (let dy = 0; heightTop && dy <= heightTop; ++dy) {
			let ax = w0[0] + dy * ((w2[0] - w0[0]) / heightAll);
			let bx = w0[0] + dy * ((w1[0] - w0[0]) / heightTop);
			this._scanLine(w0[1] + dy, ax, bx, rgbaI, depth);
		}
		const heightBot = w2[1] - w1[1];
		for (let dy = 0; heightBot && dy <= heightBot; ++dy) {
			let ax = w2[0] + dy * ((w0[0] - w2[0]) / heightAll);
			let bx = w2[0] + dy * ((w1[0] - w2[0]) / heightBot);
			this._scanLine(w2[1] - dy, ax, bx, rgbaI, depth);
		}
	}
}
class InputHandler {
	constructor(element) {
		element.setAttribute("tabindex", "1");
		element.focus();
		this.mouseState = [];
		element.addEventListener("mousedown", (evt) => {
			this.mouseState[evt.button] = true;
		});
		element.addEventListener("mouseup", (evt) => {
			this.mouseState[evt.button] = false;
		});
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

const parseObj = (text) => {
	const obj = { v: [], vt: [], vn: [], f: {} };
	let group = undefined;
	text.split('\n').forEach((line, lineNumber) => {
		line = line.replace(/#.*$/, ""); // Comments.
		if (line.length === 0) return;
		const entry = line.trim().split(/\s+/);
		const command = entry.shift()
		switch (command) {
			case "v": // Geometric vertices.
			case "vn": // Vertex normals.
			case "vt": // Texture vertices.
				obj[command].push(new Vec3(...entry.map((f) => parseFloat(f))));
				break;
			case "f": // Face.
				obj.f[group].push(entry.map((t) => {
					return t.split("/").map((i) => parseInt(i, 10) - 1);
				}));
				break;
			case "g": // Group name.
				group = entry.shift();
				if (!group) {
					throw new Error(`Missing group name at line ${lineNumber}`);
				}
				if (!obj.f[group]) {
					obj.f[group] = [];
				}
				break;
			case "s": // Smoothing group.
				break; // Ignored.
			default:
				throw new Error(`Unsupported or invalid command: '${command ?? ""}' at line ${lineNumber}`);
		}
	});
	return obj;
};

const element = document.getElementById("renderer");
const canvas = new Canvas(element, 720, 600, 1);
const input = new InputHandler(element);

const animate = (chunk) =>  {
	let lastT = performance.now();
	let t = 0;
	let avgDT = 0;
	let animating = false;
	(function tick() {
		const newT = performance.now();
		if (animating) {
			const dt = newT - lastT
			t += dt;
			canvas.clear();
			chunk(t/1000);
			avgDT = avgDT * 0.9 + 0.1 * (performance.now() - newT);
			canvas.present(Math.floor(1000 / avgDT));
		}
		animating = !input.mouse(0);
		lastT = newT;
		requestAnimationFrame(tick);
	})();
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

fetch("/head.obj")
.then((value) => value.text())
.then((text) => parseObj(text))
.then((obj) => {
	const hw = canvas.width / 2;
	const hh = canvas.height / 2;
	const sf = 0.9*Math.min(hh, hw);
	const ox = hw, oy = hh;
	const head = obj.f["head"];
	const renderOpts = {
		lightDir: new Vec3(0, 0, -1),
	};
	animate((t) => {
		if (input.keyboard("Digit0") || input.keyboard("Digit3")) {
			canvas.debugMode = null;
		} else if (input.keyboard("Digit1")) {
			canvas.debugMode = "wireframe";
		} else if (input.keyboard("Digit2")) {
			canvas.debugMode = "zbuffer";
		}
		const cos = Math.cos(t), sin = Math.sin(t);
		let transform = new Matrix4x4(
			sf*cos , 0      , sf*sin  , ox ,
			0      , -sf    , 0       , oy ,
			sf*sin , 0      , -sf*cos , ox ,
		);
		const prng = xmur("head");
		for (let fi = 0; fi < head.length; ++fi) {
			const f = head[fi];
			const v0 = obj.v[f[0][0]];
			const v1 = obj.v[f[1][0]];
			const v2 = obj.v[f[2][0]];

			const w0 = Matrix4x4.apply(transform, v0).round();
			const w1 = Matrix4x4.apply(transform, v1).round();
			const w2 = Matrix4x4.apply(transform, v2).round();
			const rgba = [prng(), prng(), prng(), 255];
			canvas.triangle3d(w0, w1, w2, rgba, renderOpts);
		}
	});
});
