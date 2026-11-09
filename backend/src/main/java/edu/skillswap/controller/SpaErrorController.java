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
        String path = request.getRequestURI();
        Object statusAttr = request.getAttribute(RequestDispatcher.ERROR_STATUS_CODE);
        int status = statusAttr instanceof Number number ? number.intValue() : 404;
        if (path != null && path.startsWith("/api")) {
            if (status == 404) {
                return ResponseEntity.status(404).body(Api.map("error", "Not found"));
            }
            return ResponseEntity.status(status).body(Api.map("error", "Request failed"));
        }
        Path index = Path.of("dist", "index.html");
        if (status == 404 && props.isProd() && Files.isRegularFile(index)) {
            return ResponseEntity.ok()
                    .contentType(MediaType.TEXT_HTML)
                    .body(new FileSystemResource(index));
        }
        return ResponseEntity.status(status == 0 ? 404 : status).body(Api.map("error", "Not found"));
    }
}
