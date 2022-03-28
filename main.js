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
}

const canvas = new Canvas("renderer", 800, 600);
for (let y = 0; y < canvas.height; ++y) {
	for (let x = 0; x < canvas.width; ++x) {
		const u = x/canvas.width*255;
		const v = y/canvas.height*255;
		canvas.set(x, y, [ u, v, 255-u, 255 ])
	}
}
canvas.present();