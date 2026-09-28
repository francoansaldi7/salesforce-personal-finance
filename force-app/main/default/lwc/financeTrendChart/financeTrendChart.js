import { LightningElement, api } from 'lwc';
import { MONTH_NAMES, MONTH_SHORT, formatMoney } from 'c/financeUtils';

const CHART_WIDTH = 600;
const PLOT_TOP = 8;
const PLOT_BOTTOM = 180;
const BAR_WIDTH = 13;
const BAR_GAP = 3;
// Tooltips near either edge are anchored to that edge so the panel doesn't clip them.
const EDGE_PCT = 10;

const SERIES = {
    income: { label: 'Income', valueKey: 'income' },
    expense: { label: 'Expenses', valueKey: 'expenses' }
};

export default class FinanceTrendChart extends LightningElement {
    @api loading = false;
    @api points = [];

    viewBox = `0 0 ${CHART_WIDTH} ${PLOT_BOTTOM}`;
    baselineY = PLOT_BOTTOM;
    midlineY = (PLOT_TOP + PLOT_BOTTOM) / 2;
    toplineY = PLOT_TOP;
    barWidth = BAR_WIDTH;
    chartWidth = CHART_WIDTH;

    hoveredBar = null; // { index, series }

    get safePoints() {
        return this.points || [];
    }

    get maxValue() {
        return Math.max(0, ...this.safePoints.map(p => Math.max(p.income, p.expenses)));
    }

    get hasData() {
        return this.maxValue > 0;
    }

    get showEmptyState() {
        return !this.loading;
    }

    get topLabel() {
        return formatMoney(this.maxValue);
    }

    get midLabel() {
        return formatMoney(this.maxValue / 2);
    }

    get chartClass() {
        return this.hoveredBar ? 'chart chart--hovering' : 'chart';
    }

    get groups() {
        const points = this.safePoints;
        const slot = CHART_WIDTH / Math.max(points.length, 1);
        const max = this.maxValue || 1;
        const plotHeight = PLOT_BOTTOM - PLOT_TOP;
        const lastIndex = points.length - 1;

        return points.map((point, index) => {
            const center = slot * index + slot / 2;
            const incomeHeight = (point.income / max) * plotHeight;
            const expenseHeight = (point.expenses / max) * plotHeight;
            const monthName = `${MONTH_NAMES[point.month - 1]} ${point.year}`;
            return {
                key: `${point.year}-${point.month}`,
                index,
                incomeX: center - BAR_WIDTH - BAR_GAP / 2,
                incomeY: PLOT_BOTTOM - incomeHeight,
                incomeHeight,
                incomeClass: this.barClass('income', index),
                incomeLabel: `${monthName} income ${formatMoney(point.income)}`,
                expenseX: center + BAR_GAP / 2,
                expenseY: PLOT_BOTTOM - expenseHeight,
                expenseHeight,
                expenseClass: this.barClass('expense', index),
                expenseLabel: `${monthName} expenses ${formatMoney(point.expenses)}`,
                label: point.month === 1 ? `${MONTH_SHORT[0]} '${String(point.year).slice(2)}` : MONTH_SHORT[point.month - 1],
                labelClass: index === lastIndex ? 'month-label month-label--selected' : 'month-label'
            };
        });
    }

    barClass(series, index) {
        const isHovered = this.hoveredBar?.series === series && this.hoveredBar?.index === index;
        return `bar bar--${series}${isHovered ? ' bar--hovered' : ''}`;
    }

    get tooltip() {
        if (!this.hoveredBar) {
            return null;
        }
        const { index, series } = this.hoveredBar;
        const point = this.safePoints[index];
        const group = this.groups[index];
        if (!point || !group) {
            return null;
        }
        const isIncome = series === 'income';
        const barX = isIncome ? group.incomeX : group.expenseX;
        const barTop = isIncome ? group.incomeY : group.expenseY;
        const leftPct = ((barX + BAR_WIDTH / 2) / CHART_WIDTH) * 100;

        let horizontalShift = '-50%';
        if (leftPct < EDGE_PCT) {
            horizontalShift = '-12px';
        } else if (leftPct > 100 - EDGE_PCT) {
            horizontalShift = 'calc(-100% + 12px)';
        }

        return {
            month: `${MONTH_NAMES[point.month - 1]} ${point.year}`,
            label: SERIES[series].label,
            amount: formatMoney(point[SERIES[series].valueKey]),
            className: `tooltip tooltip--${series}`,
            style: `left: ${leftPct}%; top: ${barTop}px; transform: translate(${horizontalShift}, calc(-100% - 10px));`
        };
    }

    handleBarEnter(event) {
        const { index, series } = event.currentTarget.dataset;
        this.hoveredBar = { index: Number(index), series };
    }

    handleBarLeave() {
        this.hoveredBar = null;
    }
}
