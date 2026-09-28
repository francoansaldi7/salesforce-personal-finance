import { LightningElement, api } from 'lwc';

const LISTBOX_MAX_HEIGHT = 264;
const VIEWPORT_MARGIN = 8;
const GAP = 4;

/**
 * Themed replacement for lightning-combobox (whose option list can't be styled from outside).
 * Same contract: `value`, `options` [{ label, value }], and a `change` event with `detail.value`.
 * The list is position: fixed so it can escape scrolling modals and overflow-hidden panels.
 */
export default class FinanceSelect extends LightningElement {
    @api label = '';
    @api placeholder = 'Select...';
    @api value = '';
    @api options = [];

    isOpen = false;
    activeIndex = -1;
    listboxStyle = '';
    needsPlacement = false;

    handleWindowClick = event => {
        if (!this.template.host.contains(event.target)) {
            this.close();
        }
    };

    // Scrolling anything but the list itself (a modal body, the page) would leave the list stranded.
    handleWindowScroll = event => {
        if (!this.template.host.contains(event.target)) {
            this.close();
        }
    };

    handleWindowResize = () => this.close();

    disconnectedCallback() {
        this.removeWindowListeners();
    }

    renderedCallback() {
        if (!this.isOpen) {
            return;
        }
        if (this.needsPlacement) {
            this.needsPlacement = false;
            this.placeListbox();
            return;
        }
        const active = this.template.querySelector('.option--active');
        if (active && active.scrollIntoView) {
            active.scrollIntoView({ block: 'nearest' });
        }
    }

    // ── Display ───────────────────────────────────────────────────────────────

    get safeOptions() {
        return this.options || [];
    }

    get selectedOption() {
        return this.safeOptions.find(option => option.value === this.value);
    }

    get displayLabel() {
        return this.selectedOption ? this.selectedOption.label : this.placeholder;
    }

    get triggerClass() {
        let className = 'trigger';
        if (this.isOpen) {
            className += ' trigger--open';
        }
        if (!this.selectedOption) {
            className += ' trigger--placeholder';
        }
        return className;
    }

    get listboxClass() {
        return this.needsPlacement ? 'listbox' : 'listbox listbox--placed';
    }

    get ariaExpanded() {
        return String(this.isOpen);
    }

    get optionItems() {
        return this.safeOptions.map((option, index) => {
            const isSelected = option.value === this.value;
            let className = 'option';
            if (isSelected) {
                className += ' option--selected';
            }
            if (index === this.activeIndex) {
                className += ' option--active';
            }
            return { ...option, key: `${index}-${option.value}`, index, isSelected, className, ariaSelected: String(isSelected) };
        });
    }

    // ── Open / close ─────────────────────────────────────────────────────────

    open() {
        if (this.isOpen || this.safeOptions.length === 0) {
            return;
        }
        const selectedIndex = this.safeOptions.findIndex(option => option.value === this.value);
        this.activeIndex = selectedIndex >= 0 ? selectedIndex : 0;
        // Render hidden first so the list can be measured before it's placed.
        this.listboxStyle = 'visibility: hidden; top: 0; left: 0;';
        this.needsPlacement = true;
        this.isOpen = true;
        // Capture phase: the modal stops click propagation, which would otherwise hide outside clicks.
        window.addEventListener('click', this.handleWindowClick, true);
        window.addEventListener('scroll', this.handleWindowScroll, true);
        window.addEventListener('resize', this.handleWindowResize);
    }

    close() {
        if (!this.isOpen) {
            return;
        }
        this.isOpen = false;
        this.removeWindowListeners();
    }

    removeWindowListeners() {
        window.removeEventListener('click', this.handleWindowClick, true);
        window.removeEventListener('scroll', this.handleWindowScroll, true);
        window.removeEventListener('resize', this.handleWindowResize);
    }

    /**
     * Places the list under the trigger, or above it when there isn't room below.
     * Measuring where "top: 0; left: 0" actually landed corrects for any ancestor that
     * creates a containing block for fixed elements (e.g. the modal overlay's backdrop-filter).
     */
    placeListbox() {
        const listbox = this.template.querySelector('.listbox');
        const trigger = this.template.querySelector('.trigger');
        const triggerRect = trigger.getBoundingClientRect();
        const origin = listbox.getBoundingClientRect();
        const listHeight = Math.min(listbox.scrollHeight, LISTBOX_MAX_HEIGHT);

        const spaceBelow = window.innerHeight - triggerRect.bottom - VIEWPORT_MARGIN;
        const openUpwards = spaceBelow < listHeight && triggerRect.top > spaceBelow;
        const top = openUpwards ? triggerRect.top - GAP - listHeight : triggerRect.bottom + GAP;

        this.listboxStyle = [
            `top: ${top - origin.top}px`,
            `left: ${triggerRect.left - origin.left}px`,
            `width: ${triggerRect.width}px`,
            `max-height: ${LISTBOX_MAX_HEIGHT}px`
        ].join('; ');
    }

    // ── Interaction ──────────────────────────────────────────────────────────

    handleTriggerClick() {
        if (this.isOpen) {
            this.close();
        } else {
            this.open();
        }
    }

    handleOptionMouseDown(event) {
        // Keep focus on the trigger so keyboard navigation continues to work.
        event.preventDefault();
    }

    handleOptionClick(event) {
        this.select(Number(event.currentTarget.dataset.index));
    }

    handleOptionHover(event) {
        this.activeIndex = Number(event.currentTarget.dataset.index);
    }

    handleKeyDown(event) {
        const lastIndex = this.safeOptions.length - 1;
        switch (event.key) {
            case 'ArrowDown':
            case 'ArrowUp':
                event.preventDefault();
                if (!this.isOpen) {
                    this.open();
                } else {
                    const step = event.key === 'ArrowDown' ? 1 : -1;
                    this.activeIndex = Math.min(Math.max(this.activeIndex + step, 0), lastIndex);
                }
                break;
            case 'Home':
            case 'End':
                if (this.isOpen) {
                    event.preventDefault();
                    this.activeIndex = event.key === 'Home' ? 0 : lastIndex;
                }
                break;
            case 'Enter':
            case ' ':
                event.preventDefault();
                if (this.isOpen && this.activeIndex >= 0) {
                    this.select(this.activeIndex);
                } else {
                    this.open();
                }
                break;
            case 'Escape':
                if (this.isOpen) {
                    // Close just the list, not the modal it may be sitting in.
                    event.stopPropagation();
                    this.close();
                }
                break;
            case 'Tab':
                this.close();
                break;
            default:
        }
    }

    select(index) {
        const option = this.safeOptions[index];
        this.close();
        if (option && option.value !== this.value) {
            this.dispatchEvent(new CustomEvent('change', { detail: { value: option.value } }));
        }
    }
}
