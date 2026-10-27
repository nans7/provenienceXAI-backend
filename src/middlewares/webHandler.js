// Adapt the backend's Request/Response services to Express without exposing
// database configuration or credentials in the frontend deployment.
export function webHandler(handler) {
  return async (req, res, next) => {
    try {
      const headers = new Headers();
      for (const [name, value] of Object.entries(req.headers)) {
        if (value !== undefined && !["content-length", "transfer-encoding"].includes(name)) headers.set(name, Array.isArray(value) ? value.join(", ") : value);
      }
      const body = ["GET", "HEAD"].includes(req.method) ? undefined : JSON.stringify(req.body ?? {});
      const request = new Request(`${req.protocol}://${req.get("host")}${req.originalUrl}`, { method: req.method, headers, ...(body === undefined ? {} : {body}) });
      const response = await handler(request);
      res.status(response.status);
      response.headers.forEach((value, name) => res.setHeader(name, value));
      res.send(Buffer.from(await response.arrayBuffer()));
    } catch (error) { next(error); }
  };
}
