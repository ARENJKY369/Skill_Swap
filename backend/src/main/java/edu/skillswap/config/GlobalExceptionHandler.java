package edu.skillswap.config;

import com.fasterxml.jackson.databind.exc.InvalidFormatException;
import com.fasterxml.jackson.databind.exc.UnrecognizedPropertyException;
import edu.skillswap.Api;
import edu.skillswap.ApiException;
import edu.skillswap.service.AuditService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.core.io.FileSystemResource;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageConversionException;
import org.springframework.validation.FieldError;
import org.springframework.validation.ObjectError;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.servlet.NoHandlerFoundException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestControllerAdvice
public class GlobalExceptionHandler {

    private final AppProperties props;
    private final AuditService audit;

    public GlobalExceptionHandler(AppProperties props, AuditService audit) {
        this.props = props;
        this.audit = audit;
    }

    @ExceptionHandler(ApiException.class)
    public ResponseEntity<Map<String, Object>> handleApi(ApiException ex) {
        return ResponseEntity.status(ex.status()).body(ex.body());
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<Map<String, Object>> handleValidation(MethodArgumentNotValidException ex,
                                                                HttpServletRequest request) {
        List<Map<String, Object>> issues = new ArrayList<>();
        List<String> details = new ArrayList<>();
        for (ObjectError error : ex.getBindingResult().getAllErrors()) {
            String path = error instanceof FieldError field ? field.getField() : error.getObjectName();
            String message = error.getDefaultMessage() == null ? "Invalid value" : error.getDefaultMessage();
            details.add(path + ": " + message);
            if (issues.size() < 5) {
                Map<String, Object> issue = new LinkedHashMap<>();
                issue.put("path", path);
                issue.put("message", message);
                issues.add(issue);
            }
        }
        System.out.println("[validation] " + request.getRequestURI() + " " + String.join("; ", details));
        return ResponseEntity.badRequest().body(Api.map("error", "Invalid request data", "issues", issues));
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<Map<String, Object>> handleUnreadable(HttpMessageNotReadableException ex) {
        List<Map<String, Object>> issues = new ArrayList<>();
        Throwable cause = ex.getCause();
        if (cause instanceof UnrecognizedPropertyException unknown) {
            issues.add(Api.map("path", unknown.getPropertyName(), "message", "Unknown property"));
        } else if (cause instanceof InvalidFormatException format) {
            StringBuilder path = new StringBuilder();
            for (com.fasterxml.jackson.databind.JsonMappingException.Reference ref : format.getPath()) {
                if (path.length() > 0) {
                    path.append('.');
                }
                path.append(ref.getFieldName() == null ? ref.getIndex() : ref.getFieldName());
            }
            issues.add(Api.map("path", path.toString(), "message", "Invalid value"));
        } else {
            issues.add(Api.map("path", "", "message", "Invalid JSON"));
        }
        return ResponseEntity.badRequest().body(Api.map("error", "Invalid request data", "issues", issues));
    }

    @ExceptionHandler({MissingServletRequestParameterException.class,
            MethodArgumentTypeMismatchException.class,
            HttpMessageConversionException.class})
    public ResponseEntity<Map<String, Object>> handleBadRequest(Exception ex) {
        return ResponseEntity.badRequest().body(Api.map("error", "Invalid request data"));
    }

    @ExceptionHandler({NoHandlerFoundException.class, NoResourceFoundException.class,
            HttpRequestMethodNotSupportedException.class})
    public ResponseEntity<?> handleNotFound(HttpServletRequest request) {
        return spaOrNotFound(request);
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, Object>> handleGeneric(Exception ex, HttpServletRequest request) {
        String correlationId = UUID.randomUUID().toString().substring(0, 8);
        System.err.println("[error:" + correlationId + "] " + request.getMethod() + " " + request.getRequestURI());
        ex.printStackTrace(System.err);
        audit.log(null, "unhandled_error", Api.clientIp(request), "failure", correlationId);
        return ResponseEntity.status(500).body(
                Api.map("error", "Something went wrong. Please try again.", "correlationId", correlationId));
    }

    private ResponseEntity<?> spaOrNotFound(HttpServletRequest request) {
        String path = request.getRequestURI();
        if (path.startsWith("/api")) {
            return ResponseEntity.status(404).body(Api.map("error", "Not found"));
        }
        Path index = Path.of("dist", "index.html");
        if (props.isProd() && Files.isRegularFile(index)) {
            return ResponseEntity.ok()
                    .contentType(MediaType.TEXT_HTML)
                    .body(new FileSystemResource(index));
        }
        return ResponseEntity.status(404).body(Api.map("error", "Not found"));
    }
}
