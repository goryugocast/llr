interface ReflectionDayHeadingOptions {
    date: string;
    dateLabel: string;
    isToday: boolean;
    openNote?: (date: string) => void;
}

/** Build the anchored date heading, making it actionable only when an open route exists. */
export function createReflectionDayHeading({ date, dateLabel, isToday, openNote }: ReflectionDayHeadingOptions): HTMLHeadingElement {
    const heading = document.createElement('h2');
    heading.dataset.anchor = date;
    if (openNote) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'llr-reflection-day-link';
        button.setAttribute('aria-label', `${date}のデイリーノートを開く`);
        button.title = `${date}のデイリーノートを開く`;
        button.append(document.createTextNode(dateLabel));
        if (isToday) {
            const today = document.createElement('small');
            today.textContent = '今日';
            button.append(today);
        }
        button.addEventListener('click', () => openNote(date));
        heading.append(button);
    } else {
        heading.append(document.createTextNode(dateLabel));
        if (isToday) {
            const today = document.createElement('small');
            today.textContent = '今日';
            heading.append(today);
        }
    }
    return heading;
}
