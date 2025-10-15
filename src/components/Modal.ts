type ModalDisplayOptions = {
	title: string;
	content: any;
	isLarge?: boolean;
	onClose?: (() => void) | null;
};

class _HTMLGenericModal extends HTMLElement {
	private _onClose: (() => void) | null;

	constructor() {
		super();
		this._onClose = null;
	}

	hide(): void {
        const _removeFromDom = (timeoutDuration: number) => {
            setTimeout(() => {
                this?.remove();
                if (typeof this._onClose === "function") {
                    this._onClose();
                }
            }, timeoutDuration)
        };

        const genericModal = this?.querySelector(".Animated__GenericModal__overlay");
        if (genericModal) {
            genericModal.classList.remove("Active");
            _removeFromDom((0.3 * 1000) + 50);
        } else {
            _removeFromDom(0);
        }
	}

	/**
	 * Display the modal.
	 * @param {Object} options
	 * @param {string} options.title
	 * @param {any} options.content
	 * @param {boolean} [options.isLarge]
	 * @param {function} [options.onClose] - Optional callback to run when modal is closed
	 */
	display({ title, content, isLarge = false, onClose = null }: ModalDisplayOptions): void {
		// If a previous onClose exists, call it before displaying a new popup
		if (typeof this._onClose === "function") {
			this._onClose();
		}
		this._onClose = onClose;
		this.innerHTML = `
<div class="GenericModal__overlay Animated__GenericModal__overlay" style="z-index: 100;">
	<div class="GenericModal" tabindex="-1" role="dialog" aria-label="${title}" aria-modal="true">
		<div class="${isLarge ? "main-embedWidgetGenerator-container" : "main-trackCreditsModal-container"}">
			<div class="main-trackCreditsModal-header">
				<h1 class="main-type-alto" as="h1">${title}</h1>
				<button aria-label="Close" class="main-trackCreditsModal-closeBtn"><svg width="18" height="18" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><title>Close</title><path d="M31.098 29.794L16.955 15.65 31.097 1.51 29.683.093 15.54 14.237 1.4.094-.016 1.508 14.126 15.65-.016 29.795l1.414 1.414L15.54 17.065l14.144 14.143" fill="currentColor" fill-rule="evenodd"></path></svg></button>
			</div>
			<div class="main-trackCreditsModal-mainSection">
				<main class="main-trackCreditsModal-originalCredits"></main>
			</div>
		</div>
	</div>
</div>`;

		const closeBtn = this.querySelector("button");
		if (closeBtn) {
			(closeBtn as HTMLButtonElement).onclick = this.hide.bind(this);
		}
		const main = this.querySelector("main");
		const hidePopup = this.hide.bind(this);

		// Listen for click events on Overlay
		const overlay = this.querySelector(".GenericModal__overlay");
		const modal = this.querySelector(".GenericModal");
		if (overlay && modal) {
			overlay.addEventListener("click", (event: MouseEvent) => {
				if (!modal.contains(event.target as Node)) hidePopup();
			});
		}

		if (main) {
			if (typeof content === "string") {
				main.innerHTML = content;
			} else if (content instanceof Node) {
				main.append(content);
			} else if (content !== null && content !== undefined) {
				main.append(String(content));
			}
		}
		document.body.append(this);

        setTimeout(() => {
            const genericModal = this.querySelector(".Animated__GenericModal__overlay");
            if (genericModal) genericModal.classList.add("Active");
        }, 50);
	}
}
customElements.define("sl-generic-modal", _HTMLGenericModal);
export const PopupModal = new _HTMLGenericModal();