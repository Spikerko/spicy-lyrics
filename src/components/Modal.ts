type ModalDisplayOptions = {
	title: string;
	content: any;
	isLarge?: boolean;
	onClose?: (() => void) | null;
	closeBtn?: boolean;
	closeOnOutsideClick?: boolean;
	/** Replaces the default hide() behavior for the close button and outside-click. */
	closeHandler?: (() => void) | null;
};

type ModalTransitionOptions = {
	content: any;
	onClose?: (() => void) | null;
	closeHandler?: (() => void) | null;
};

class _HTMLGenericModal extends HTMLElement {
	private _onClose: (() => void) | null;

	constructor() {
		super();
		this.classList.add("SpicyLyricsModal");
		this._onClose = null;
	}

	hide(): void {
        const capturedOnClose = this._onClose;
        this._onClose = null;
        const _removeFromDom = (timeoutDuration: number) => {
            setTimeout(() => {
                this?.remove();
                if (typeof capturedOnClose === "function") {
                    capturedOnClose();
                }
            }, timeoutDuration)
        };

        const genericModal = this?.querySelector(".sl-modal-overlay-animated");
        if (genericModal) {
            genericModal.classList.remove("Active");
            _removeFromDom((0.3 * 1000) + 50);
        } else {
            _removeFromDom(0);
        }
	}

	/**
	 * Instantly swap modal content without hiding/re-animating.
	 * Use for modal-to-modal transitions where the frame should stay visible.
	 */
	transition({ content, onClose = null, closeHandler = null }: ModalTransitionOptions): void {
		if (typeof this._onClose === "function") {
			this._onClose();
		}
		this._onClose = onClose;
		const closeButton = this.querySelector(".sl-modal-close-btn");
		if (closeButton) {
			(closeButton as HTMLButtonElement).onclick = closeHandler ?? this.hide.bind(this);
		}
		const main = this.querySelector("main");
		if (main) {
			main.innerHTML = "";
			if (typeof content === "string") {
				main.innerHTML = content;
			} else if (content instanceof Node) {
				main.append(content);
			}
		}
	}

	/**
	 * Display the modal.
	 * @param {Object} options
	 * @param {string} options.title
	 * @param {any} options.content
	 * @param {boolean} [options.isLarge]
	 * @param {function} [options.onClose] - Optional callback to run when modal is closed
	 * @param {boolean} [options.closeBtn=true] - Show modal close button
	 * @param {boolean} [options.closeOnOutsideClick=true] - Allow closing modal by clicking outside
	 */
	display({ title, content, isLarge = false, onClose = null, closeBtn = true, closeOnOutsideClick = true, closeHandler = null }: ModalDisplayOptions): void {
		// If a previous onClose exists, call it before displaying a new popup
		if (typeof this._onClose === "function") {
			this._onClose();
		}
		this._onClose = onClose;
		this.innerHTML = `
<div class="sl-modal-overlay sl-modal-overlay-animated" style="z-index: 100;">
	<div class="sl-modal" tabindex="-1" role="dialog" aria-label="${title}" aria-modal="true">
		<div class="${isLarge ? "sl-modal-container-large" : "sl-modal-container"}">
			<div class="sl-modal-header">
				<h1 class="sl-modal-title" as="h1">${title}</h1>
				${closeBtn ? '<button aria-label="Close" class="sl-modal-close-btn"><svg width="18" height="18" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><title>Close</title><path d="M31.098 29.794L16.955 15.65 31.097 1.51 29.683.093 15.54 14.237 1.4.094-.016 1.508 14.126 15.65-.016 29.795l1.414 1.414L15.54 17.065l14.144 14.143" fill="currentColor" fill-rule="evenodd"></path></svg></button>' : ""}
			</div>
			<div class="sl-modal-main-section">
				<main class="sl-modal-content"></main>
			</div>
		</div>
	</div>
</div>`;

		const closeButton = this.querySelector("button");
		if (closeButton) {
			(closeButton as HTMLButtonElement).onclick = closeHandler ?? this.hide.bind(this);
		}
		const main = this.querySelector("main");
		const hidePopup = closeHandler ?? this.hide.bind(this);

		// Listen for click events on Overlay
		const overlay = this.querySelector(".sl-modal-overlay");
		const modal = this.querySelector(".sl-modal");
		if (overlay && modal) {
			overlay.addEventListener("click", (event: MouseEvent) => {
				if (closeOnOutsideClick && !modal.contains(event.target as Node)) hidePopup();
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
            const genericModal = this.querySelector(".sl-modal-overlay-animated");
            if (genericModal) genericModal.classList.add("Active");
        }, 50);
	}
}
customElements.define("sl-generic-modal", _HTMLGenericModal);
export const PopupModal = new _HTMLGenericModal();