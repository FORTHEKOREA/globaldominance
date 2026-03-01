// src/animations/missile.js

/**
 * Creates a temporary missile element and animates its flight between two DOM elements.
 * @param {HTMLElement} fromElem - The source element.
 * @param {HTMLElement} toElem - The target element.
 * @param {object} [options] - Animation options.
 * @param {string} [options.color] - The color of the missile.
 * @param {number} [options.duration=1200] - The flight duration in ms.
 */
export function launchMissile(fromElem, toElem, options = {}) {
	if (!fromElem || !toElem) return;

	const fromRect = fromElem.getBoundingClientRect();
	const toRect = toElem.getBoundingClientRect();

	const missile = document.createElement('div');
	missile.className = 'gd-missile';
	if (options.color) {
		missile.style.background = options.color;
		missile.style.boxShadow = `0 0 12px ${options.color}, 0 0 20px ${options.color}`;
	}

	document.body.appendChild(missile);

	const startX = fromRect.left + fromRect.width / 2;
	const startY = fromRect.top + fromRect.height / 2;
	const endX = toRect.left + toRect.width / 2;
	const endY = toRect.top + toRect.height / 2;

	const deltaX = endX - startX;
	const deltaY = endY - startY;
	const angle = Math.atan2(deltaY, deltaX) * (180 / Math.PI);

	missile.style.left = `${startX}px`;
	missile.style.top = `${startY}px`;
	missile.style.transform = `translate(-50%, -50%) rotate(${angle + 90}deg)`;

	const anim = missile.animate(
		[{ left: `${startX}px`, top: `${startY}px`, opacity: 1 }, { left: `${endX}px`, top: `${endY}px`, opacity: 0 }],
		{ duration: options.duration || 1200, easing: 'cubic-bezier(0.3, 0, 0.7, 1)' }
	);

	anim.onfinish = () => {
		const explosion = document.createElement('div');
		explosion.className = 'gd-explosion';
		explosion.style.left = `${endX}px`;
		explosion.style.top = `${endY}px`;
		document.body.appendChild(explosion);
		setTimeout(() => explosion.remove(), 500);
		missile.remove();
	};
}