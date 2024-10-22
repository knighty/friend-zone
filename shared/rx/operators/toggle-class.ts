export function toggleClass(element: HTMLElement, c: string) {
    return (visible: boolean) => element.classList.toggle(c, visible);
}