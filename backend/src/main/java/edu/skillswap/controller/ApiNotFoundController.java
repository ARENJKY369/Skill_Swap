package edu.skillswap.controller;

import edu.skillswap.Api;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
public class ApiNotFoundController {

    @RequestMapping({"/api", "/api/**"})
    public ResponseEntity<Map<String, Object>> notFound() {
        return ResponseEntity.status(404).body(Api.map("error", "Not found"));
    }
}
