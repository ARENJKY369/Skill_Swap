package edu.skillswap.controller;

import edu.skillswap.Api;
import edu.skillswap.config.AppProperties;
import jakarta.servlet.RequestDispatcher;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.boot.web.servlet.error.ErrorController;
import org.springframework.core.io.FileSystemResource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.nio.file.Files;
import java.nio.file.Path;

@RestController
public class SpaErrorController implements ErrorController {

    private final AppProperties props;

    public SpaErrorController(AppProperties props) {
        this.props = props;
    }

    @RequestMapping("/error")
    public ResponseEntity<?> error(HttpServletRequest request) {
        String correlationId = Api.correlationId(request);
        Object origUri = request.getAttribute(RequestDispatcher.ERROR_REQUEST_URI);
        String path = origUri instanceof String s ? s : request.getRequestURI();
        Object statusAttr = request.getAttribute(RequestDispatcher.ERROR_STATUS_CODE);
        int status = statusAttr instanceof Number number ? number.intValue() : 404;
        if (path != null && path.startsWith("/api")) {
            String message = switch (status) {
                case 401 -> "Authentication required";
                case 403 -> "Access denied";
                case 404 -> "Endpoint not found";
                case 405 -> "Method not allowed";
                case 423 -> "Account locked";
                case 429 -> "Too many attempts";
                default -> "Internal server error";
            };
            return ResponseEntity.status(status)
                    .header(Api.CORRELATION_HEADER, correlationId)
                    .body(Api.map("error", message, "correlationId", correlationId));
        }
        Path index = Path.of("dist", "index.html");
        if (status == 404 && props.isProd() && Files.isRegularFile(index)) {
            return ResponseEntity.ok()
                    .contentType(MediaType.TEXT_HTML)
                    .body(new FileSystemResource(index));
        }
        return ResponseEntity.status(status == 0 ? 404 : status)
                .header(Api.CORRELATION_HEADER, correlationId)
                .body(Api.map("error", "Not found", "correlationId", correlationId));
    }
}
