"use strict";
const cross = (a, b) => {
	return [
		a[1]*b[2] - a[2]*b[1],
		a[2]*b[0] - a[0]*b[2],
		a[0]*b[1] - a[1]*b[0],
	];
};
const barycentric = (pts, p) => {
	const u = cross(
		[ pts[2][0]-pts[0][0], pts[1][0]-pts[0][0], pts[0][0]-p[0] ],
		[ pts[2][1]-pts[0][1], pts[1][1]-pts[0][1], pts[0][1]-p[1] ],
	);
	if (Math.abs(u[2] < 1)) return [-1,1,1];
	return [ 1 - (u[0]+u[1])/u[2], u[1]/u[2], u[0]/u[2] ];
};
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
		const min = [
			Math.max(Math.min(x0, x1, x2), 0),
			Math.max(Math.min(y0, y1, y2), 0),
		];
		const max = [
			Math.min(Math.max(x0, x1, x2), this.width-1),
			Math.min(Math.max(y0, y1, y2), this.height-1),
		];
		const pts = [[x0,y0],[x1,y1],[x2,y2]];
		for (let y = min[1]; y <= max[1]; ++y) {
			for (let x = min[0]; x <= max[0]; ++x) {
				const bc = barycentric(pts, [x,y]);
				if (bc[0] < 0 || bc[1] < 0 || bc[2] < 0) continue;
				this.set(x, y, rgba);
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
				obj[command].push(entry.map((f) => parseFloat(f)));
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
		animating = !mouse[0];
		lastT = newT;
		requestAnimationFrame(tick);
	})();
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
	//const stroke = [255,255,255,255];
	//const fill   = [127,127,127,255];
	animate((t) => {
		const cos = Math.cos(t), sin = Math.sin(t);
		//const cos = 1, sin = 0;
		for (let fi = 0; fi < head.length; ++fi) {
			const f = head[fi];
			const v0 = obj.v[f[0][0]];
			const v1 = obj.v[f[1][0]];
			const v2 = obj.v[f[2][0]];

			const x0 = Math.round(ox + sf*(v0[0]*cos + v0[2]*sin));
			const y0 = Math.round(oy - sf*v0[1]);
			const x1 = Math.round(ox + sf*(v1[0]*cos + v1[2]*sin));
			const y1 = Math.round(oy - sf*v1[1]);
			const x2 = Math.round(ox + sf*(v2[0]*cos + v2[2]*sin));
			const y2 = Math.round(oy - sf*v2[1]);

			if (mouse[0]) {
				canvas.triangleRasterized(x0,y0, x1,y1, x2,y2, [Math.random()*255, Math.random()*255, Math.random()*255, 255]);
			} else {
				canvas.triangle(x0,y0, x1,y1, x2,y2, [255,255,255,255]);
			}
		}
	});
});
