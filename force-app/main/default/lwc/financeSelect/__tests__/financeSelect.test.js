import { createElement } from 'lwc';
import FinanceSelect from 'c/financeSelect';

const OPTIONS = [
    { label: 'AUD — Australian Dollar', value: 'AUD' },
    { label: 'USD — US Dollar', value: 'USD' },
    { label: 'ARS — Argentine Peso', value: 'ARS' }
];

const flushPromises = () => new Promise(resolve => setTimeout(resolve, 0));

async function render(props = {}) {
    const element = createElement('c-finance-select', { is: FinanceSelect });
    Object.assign(element, { label: 'Currency', options: OPTIONS, value: 'AUD', ...props });
    document.body.appendChild(element);
    await flushPromises();
    return element;
}

const trigger = element => element.shadowRoot.querySelector('.trigger');
const listbox = element => element.shadowRoot.querySelector('[role="listbox"]');
const press = async (element, key) => {
    trigger(element).dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, composed: true }));
    await flushPromises();
};

describe('c-finance-select', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    it('shows the selected option, or the placeholder when nothing matches', async () => {
        const element = await render();
        expect(trigger(element).textContent).toBe('AUD — Australian Dollar');

        element.value = '';
        element.placeholder = 'Choose a currency...';
        await flushPromises();
        expect(trigger(element).textContent).toBe('Choose a currency...');
        expect(trigger(element).classList).toContain('trigger--placeholder');
    });

    it('opens on click with the current value marked as selected', async () => {
        const element = await render({ value: 'USD' });
        expect(listbox(element)).toBeNull();

        trigger(element).click();
        await flushPromises();

        const options = element.shadowRoot.querySelectorAll('[role="option"]');
        expect(options).toHaveLength(3);
        expect(options[1].getAttribute('aria-selected')).toBe('true');
        expect(options[1].classList).toContain('option--active');
        expect(trigger(element).getAttribute('aria-expanded')).toBe('true');
    });

    it('fires change with the picked value and closes', async () => {
        const element = await render();
        const handler = jest.fn();
        element.addEventListener('change', handler);

        trigger(element).click();
        await flushPromises();
        element.shadowRoot.querySelectorAll('[role="option"]')[2].click();
        await flushPromises();

        expect(handler.mock.calls[0][0].detail).toEqual({ value: 'ARS' });
        expect(listbox(element)).toBeNull();
    });

    it('does not fire change when re-picking the current value', async () => {
        const element = await render();
        const handler = jest.fn();
        element.addEventListener('change', handler);

        trigger(element).click();
        await flushPromises();
        element.shadowRoot.querySelectorAll('[role="option"]')[0].click();

        expect(handler).not.toHaveBeenCalled();
    });

    it('supports keyboard navigation and selection', async () => {
        const element = await render();
        const handler = jest.fn();
        element.addEventListener('change', handler);

        await press(element, 'ArrowDown');
        expect(listbox(element)).not.toBeNull();
        await press(element, 'ArrowDown');
        await press(element, 'ArrowDown');
        await press(element, 'ArrowDown');
        await press(element, 'Enter');

        expect(handler.mock.calls[0][0].detail).toEqual({ value: 'ARS' });
        expect(listbox(element)).toBeNull();
    });

    it('closes on Escape without letting the key reach a surrounding modal', async () => {
        const element = await render();
        const outerKeyHandler = jest.fn();
        document.body.addEventListener('keydown', outerKeyHandler);

        trigger(element).click();
        await flushPromises();
        await press(element, 'Escape');

        expect(listbox(element)).toBeNull();
        expect(outerKeyHandler).not.toHaveBeenCalled();
        document.body.removeEventListener('keydown', outerKeyHandler);
    });

    it('closes when clicking anywhere outside it', async () => {
        const element = await render();
        trigger(element).click();
        await flushPromises();

        document.body.click();
        await flushPromises();

        expect(listbox(element)).toBeNull();
    });
});
