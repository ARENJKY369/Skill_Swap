package edu.skillswap.controller;

import edu.skillswap.Api;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
public class ApiNotFoundController {

    @RequestMapping({"/api", "/api/**"})
    public ResponseEntity<Map<String, Object>> notFound(HttpServletRequest request) {
        String correlationId = Api.correlationId(request);
        return ResponseEntity.status(404)
                .header(Api.CORRELATION_HEADER, correlationId)
                .body(Api.map("error", "Endpoint not found", "correlationId", correlationId));
    }
}
