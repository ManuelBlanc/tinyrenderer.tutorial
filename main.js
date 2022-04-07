"use strict";
class Vec3 extends Array {
	len() {
		return Math.sqrt(this[0]*this[0] + this[1]*this[1] + this[2]*this[2]);
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
	static barycentric(a, pts) {
		const u = this.cross.apply(
			[ pts[2][0]-pts[0][0], pts[1][0]-pts[0][0], pts[0][0]-a[0] ],
			[ pts[2][1]-pts[0][1], pts[1][1]-pts[0][1], pts[0][1]-a[1] ],
		);
		if (Math.abs(u[2] < 1)) return [-1,1,1];
		return [ 1 - (u[0]+u[1])/u[2], u[1]/u[2], u[0]/u[2] ];
	}
}
class Canvas {
	constructor(id, width, height) {
		this.element = document.getElementById(id);
		this.width = this.element.width = width;
		this.height = this.element.height = height;
		this.context = this.element.getContext("2d");
		this.image = this.context.createImageData(this.width, this.height);
	}
	_idx(x, y) {
		return y * (this.width<<2) + (x<<2);
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
		const data = this.image.data
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
			this.context.font = "30px Arial";
			this.context.fillText(`${fps} FPS`, 10, 35);
		}
	}
	clear() {
		this.image.data.fill(0);
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
	triangleRasterized(x0,y0, x1,y1, x2,y2, rgba) {
		if (y0 === y1 && y0 === y2) return; // Degenerate.
		if (y0 > y1) [x0, y0, x1, y1] = [x1, y1, x0, y0];
		if (y0 > y2) [x0, y0, x2, y2] = [x2, y2, x0, y0];
		if (y1 > y2) [x1, y1, x2, y2] = [x2, y2, x1, y1];
		const totalHeight = y2 - y0;
		for (let y = 0; y < totalHeight; ++y) {
			const secondHalf = (y > y1 - y0) || (y1 === y0);
			const segmentHeight = secondHalf ? y2 - y1 : y1 - y0;
			const alpha = y / totalHeight;
			const beta  = (y - (secondHalf ? y1 - y0 : 0)) / segmentHeight;
			let ax = x0 + (x2 - x0)*alpha;
			let bx = secondHalf ? x1 + (x2 - x1)*beta : x0 + (x1 - x0)*beta;
			if (ax > bx) [ax, bx] = [bx, ax];
			for (let x = ax; x <= bx; ++x) {
				this.set(x, y0 + y, rgba);
			}
		}
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
			case "s": // Smoothing group.
				break; // Ignored.
			default:
				throw new Error(`Unsupported or invalid command: '${command ?? ""}' at line ${lineNumber}`);
		}
	});
	return obj;
};

const canvas = new Canvas("renderer", 720, 720);

const mouse = [false, false, false];
canvas.element.onmousedown = (evt) => {
	mouse[evt.button] = true; evt.preventDefault();
};
canvas.element.onmouseup = (evt) => {
	mouse[evt.button] = false; evt.preventDefault();
};
canvas.element.oncontextmenu = (evt) => evt.preventDefault();

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
			avgDT = avgDT*0.9 + dt*0.1;
			canvas.present(Math.floor(1000/avgDT));
		}
		animating = !mouse[2];
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
	const lightDir = new Vec3(0, 0, -1);
	animate((t) => {
		const cos = Math.cos(t), sin = Math.sin(t);
		//const cos = 1, sin = 0;
		const prng = xmur("head");
		for (let fi = 0; fi < head.length; ++fi) {
			const f = head[fi];
			const v0 = obj.v[f[0][0]];
			const v1 = obj.v[f[1][0]];
			const v2 = obj.v[f[2][0]];

			const w0 = new Vec3(
				Math.round(ox + sf*(v0[0]*cos + v0[2]*sin)),
				Math.round(oy - sf*v0[1]),
				Math.round(ox + sf*(v0[0]*sin - v0[2]*cos)),
			);
			const w1 = new Vec3(
				Math.round(ox + sf*(v1[0]*cos + v1[2]*sin)),
				Math.round(oy - sf*v1[1]),
				Math.round(ox + sf*(v1[0]*sin - v1[2]*cos)),
			);
			const w2 = new Vec3(
				Math.round(ox + sf*(v2[0]*cos + v2[2]*sin)),
				Math.round(oy - sf*v2[1]),
				Math.round(ox + sf*(v2[0]*sin - v2[2]*cos)),
			);


			const rgba = [prng(), prng(), prng(), 255];
			if (!mouse[0]) {
				const n = Vec3.cross(Vec3.sub(w2, w0), Vec3.sub(w1, w0));
				const i = Vec3.dot(lightDir, n) / n.len();
				if (i > 0) {
					rgba[0] *= i;
					rgba[1] *= i;
					rgba[2] *= i;
					canvas.triangleRasterized(w0[0],w0[1], w1[0],w1[1], w2[0],w2[1], rgba);
				}
			} else {
				canvas.triangle(w0[0],w0[1], w1[0],w1[1], w2[0],w2[1], [255,255,255,255]);
			}
		}
	});
});
