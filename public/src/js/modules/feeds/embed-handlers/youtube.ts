export const youtubeHandler = (url: string, element: HTMLElement) => {
    const matches = url.match(/(?:youtu\.be\/|youtube\.com(?:\/embed\/|\/v\/|\/watch\?v=|\/user\/\S+|\/ytscreeningroom\?v=))([\w\-]{10,12})\b/);
    const videoID = matches ? matches[1] : null;
    if (videoID) {
        const iframe = document.createElement("iframe");
        iframe.src = `https://www.youtube.com/embed/${videoID}?autoplay=1`;
        iframe.allow = "autoplay;";
        element.appendChild(iframe);
        return true;
    }
    return false;
}