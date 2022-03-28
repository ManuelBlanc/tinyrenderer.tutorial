"use strict";
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
		this.image.data[i]   = rgba[0];
		this.image.data[i+1] = rgba[1];
		this.image.data[i+2] = rgba[2];
		this.image.data[i+3] = rgba[3];
	}
	get(x, y) {
		const i = this._idx(x, y);
		return [
			this.image.data[i],
			this.image.data[i+1],
			this.image.data[i+2],
			this.image.data[i+3],
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
	clear(rgba) {
		if (!rgba) {
			this.context.clearRect(0, 0, this.width, this.height);
		} else {
			const [r,g,b,a] = rgba;
			this.context.fillStyle = `rgba(${r},${g},${b},${a/255})`;
			this.context.fillRect(0, 0, this.width, this.height);
		}
		this.image = this.context.getImageData(0, 0, this.width, this.height);
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
					return t.split("/").map((i) => parseInt(i, 10));
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
}

const canvas = new Canvas("renderer", 1280, 720);
canvas.clear([127,127,127,255]);
canvas.present();

fetch("/head.obj")
.then((value) => value.text())
.then((text) => parseObj(text))
.then((obj) => {
	canvas.clear([0,0,0,255]);
	canvas.present();

	const hw = canvas.width / 2;
	const hh = canvas.height / 2;
	const sf = 0.9*Math.min(hh, hw);
	const x0 = hw, y0 = hh;
	const head = obj.f["head"];

	let lastT = performance.now();
	let avgDT = 0;
	requestAnimationFrame(function animate() {
		canvas.clear([0,0,0,255]);
		const ang = Date.now()/1000*Math.PI / 2;
		const cos = Math.cos(ang), sin = Math.sin(ang);
		for (let fi = 0; fi < head.length; ++fi) {
			const f = head[fi];
			for (let vi=0; vi < f.length; ++vi) {
				const v0 = obj.v[f[ vi     ][0] - 1];
				const v1 = obj.v[f[(vi+1)%3][0] - 1];
				const cc = fi/head.length*255;
				canvas.line(
					Math.floor((x0 + sf*(v0[0]*cos + v0[2]*sin))),
					Math.floor((y0 - sf*(v0[1]))),
					Math.floor((x0 + sf*(v1[0]*cos + v1[2]*sin))),
					Math.floor((y0 - sf*(v1[1]))),
					[v0[1]*255, cc, 255-cc, 255],
				);
			}
		}
		const t = performance.now();
		avgDT = avgDT*0.9 + (t - lastT)*0.1;
		lastT = t;
		canvas.present(Math.floor(1000/avgDT));

		requestAnimationFrame(animate);
	})
});
