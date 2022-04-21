"use strict";
const ASSERT = (cond) => {
	if (!cond) throw new Error("assertion failed!");
};
class Vec3 {
	constructor(x, y, z) {
		this.x=x; this.y=y; this.z=z;
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
			[ pts[2].x-pts[0].x, pts[1].x-pts[0].x, pts[0].x-this.x ],
			[ pts[2].y-pts[0].y, pts[1].y-pts[0].y, pts[0].y-this.y ],
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
	apply(v) {
		return new Vec3(
			v.x*this.xx + v.y*this.xy + v.z*this.xz + this.tx,
			v.x*this.yx + v.y*this.yy + v.z*this.yz + this.ty,
			v.x*this.zx + v.y*this.zy + v.z*this.zz + this.tz,
		)
	}
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
		this.debugMode = null;
		this.debugTextPos = 0;
		this.imageDataClear = new Uint32Array(this.image.data.buffer);
		this.zbufferClear = new Uint32Array(this.zbuffer.buffer);
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
	present() {
		this.context.putImageData(this.image, 0, 0);
		this.debugTextPos = 0;
	}
	debugText(text) {
		this.context.fillStyle = "#00ff00";
		const fontSize = 22;
		this.context.font = `${fontSize/this.scaling}px monospace`;
		const x = 10, y = 5 + (this.debugTextPos += fontSize);
		this.context.fillText(text, x/this.scaling, y/this.scaling);
	}
	clear() {
		for (let i = this.width*this.height; i > 0; --i) {
			this.zbufferClear[i] = 0;
			this.imageDataClear[i] = 0;
		}
		//this.image.data.fill(0); // Slower.
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
	_scanLine(y, x, x1, Px, Py, Qx, Qy, uz, w0x, w0y, rgba, depth) {
		x |= 0; x1 |= 0; // Ensure integer coordinate inputs.
		if (x > x1) [x, x1] = [x1, x];
		const data = this.image.data;
		const zbuffer = this.zbuffer;
		const Qz = w0y - y;
		for (let j = y*this.width + x; x <= x1; ++x, ++j) {
			if (depth > zbuffer[j]) {
				zbuffer[j] = depth;
				const Pz = w0x - x;
				const ux = Py*Qz - Pz*Qy, uy = Pz*Qx - Px*Qz;
				const bx = 1 - (ux + uy)/uz, by = uy/uz, bz = ux/uz;
				const i = j << 2;
				if (!this.debugMode) {
					data[i  ] = rgba[0];
					data[i+1] = rgba[1];
					data[i+2] = rgba[2];
					data[i+3] = rgba[3];
				} else if (this.debugMode === "barycentric") {
					data[i  ] = bx * 255;
					data[i+1] = by * 255;
					data[i+2] = bz * 255;
					data[i+3] = 255;
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
		//if (w0.y === w1.y && w0.y === w2.y) return; // Degenerate.
		const n = Vec3.normal(w0, w1, w2);
		const li = Vec3.dot(renderOpts.lightDir, n) / n.len();
		if (this.debugMode === "wireframe") {
			this.triangle(w0.x,w0.y, w1.x,w1.y, w2.x,w2.y, [255,255,255,li >= 0 ? 255 : 127]);
			return;
		}
		if (li === 0) {
			return;
		}
		const rgbaI = [rgba[0]*li, rgba[1]*li, rgba[2]*li, rgba[3]];

		const Px = w2.x - w0.x, Py = w1.x - w0.x;
		const Qx = w2.y - w0.y, Qy = w1.y - w0.y;
		const w0x = w0.x, w0y = w0.y;
		const uz = Px*Qy - Py*Qx;
		if (uz === 0) {
			return;
		}

		if (w0.y > w1.y) [w0, w1] = [w1, w0];
		if (w0.y > w2.y) [w0, w2] = [w2, w0];
		if (w1.y > w2.y) [w1, w2] = [w2, w1];
		const depth = Math.max(w0.z, w1.z, w2.z);

		const heightAll = w2.y - w0.y;
		const heightTop = w1.y - w0.y;
		for (let dy = 0; heightTop && dy <= heightTop; ++dy) {
			let x0 = w0.x + dy * ((w2.x - w0.x) / heightAll);
			let x1 = w0.x + dy * ((w1.x - w0.x) / heightTop);
			this._scanLine(w0.y + dy, x0, x1, Px, Py, Qx, Qy, uz, w0x, w0y, rgbaI, depth);
		}
		const heightBot = w2.y - w1.y;
		for (let dy = 0; heightBot && dy <= heightBot; ++dy) {
			let x0 = w2.x + dy * ((w0.x - w2.x) / heightAll);
			let x1 = w2.x + dy * ((w1.x - w2.x) / heightBot);
			this._scanLine(w2.y - dy, x0, x1, Px, Py, Qx, Qy, uz, w0x, w0y, rgbaI, depth);
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
const canvas = new Canvas(element, 800, 600, 1);
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
			canvas.present();
			const fps = 1000 / avgDT;
			canvas.debugText(`${fps.toFixed(0).padStart(3)} FPS`);
			canvas.debugText(`${avgDT.toFixed(3).padStart(6)} ms`);
			if (canvas.debugMode) {
				canvas.debugText(`mode: ${canvas.debugMode}`);
			}
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
		if (input.keyboard("Digit0")) {
			canvas.debugMode = "empty";
		} else if (input.keyboard("Digit1")) {
			canvas.debugMode = "wireframe";
		} else if (input.keyboard("Digit2")) {
			canvas.debugMode = "zbuffer";
		} else if (input.keyboard("Digit3")) {
			canvas.debugMode = "barycentric";
		} else if (input.keyboard("Digit4")) {
			canvas.debugMode = null;
		}

		if (canvas.debugMode === "empty") {
			return;
		}

		t = Math.PI;
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

			const w0 = transform.apply(v0).round();
			const w1 = transform.apply(v1).round();
			const w2 = transform.apply(v2).round();
			const rgba = [prng(), prng(), prng(), 255];
			canvas.triangle3d(w0, w1, w2, rgba, renderOpts);
		}
	});
});
