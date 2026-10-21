/**
 * Kleine brug tussen de toolbar en het canvas (dat zijn eigen afmetingen kent).
 * Het canvas vult deze functies in zodra het gemonteerd is.
 */
export const canvasApi = {
  zoomBy: (_factor: number) => {},
};

/** MIME-type voor het slepen van een leerling vanuit een HTML-lijst naar het canvas. */
export const STUDENT_DRAG_TYPE = 'application/x-klassenplanner-student';
