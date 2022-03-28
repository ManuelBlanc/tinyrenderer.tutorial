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
	present() {
		this.context.putImageData(this.image, 0, 0);
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
		const dx = Math.abs(x1 - x0);
		const sx = x0 < x1 ? 1 : -1;
		const dy = -Math.abs(y1 - y0);
		const sy = y0 < y1 ? 1 : -1;
		let error = dx + dy;
		while (true) {
			this.set(x0, y0, rgba);
			if (x0 === x1 && y0 === y1) return;
			const e2 = 2*error;
			if (e2 >= dy) {
				if (x0 === x1) return;
				error += dy;
				x0 += sx;
			}
			if (e2 <= dy) {
				if (y0 === y1) return;
				error += dx;
				y0 += sy;
			}
		}
	}
}

const canvas = new Canvas("renderer", 800, 600);
canvas.clear([0,0,0,255]);
const hw = canvas.width*0.5, hh = canvas.height*0.5;
const dy = 150;
const dx = Math.floor(dy*Math.sqrt(3/2)); // cos(30)
const x0 = hw;
const y0 = hh - dy;
const x1 = hw - dx;
const y1 = hh + dy;
const x2 = hw + dx;
const y2 = hh + dy;
const white = [255,255,255,255]
canvas.line(x0,y0, x1,y1, white);
canvas.line(x1,y1, x2,y2, white);
canvas.line(x2,y2, x0,y0, white);
canvas.present();