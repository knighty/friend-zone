export type InputEvents = {
    input: InputEvent;
    change: InputEvent;
}

export type MouseEvents = {
    click: MouseEvent;
    mousedown: MouseEvent;
    mouseup: MouseEvent;
    mousemove: MouseEvent;
    mouseover: MouseEvent;
    mouseleave: MouseEvent;
}

export type TouchEvents = {
    touchstart: TouchEvent;
    touchend: TouchEvent;
}

export type StorageEvents = {
    storage: StorageEvent;
}

export type StateEvents = {
    popstate: PopStateEvent;
}

export type ScrollEvents = {
    scroll: Event
}

export type LoadEvents = {
    load: Event
}

export type KeyEvents = {
    keyup: KeyboardEvent,
    keydown: KeyboardEvent,
}

export type Events = InputEvents & MouseEvents & TouchEvents & StorageEvents & StateEvents & ScrollEvents & LoadEvents & KeyEvents;