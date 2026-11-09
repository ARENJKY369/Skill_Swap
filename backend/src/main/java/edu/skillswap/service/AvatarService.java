package edu.skillswap.service;

import org.springframework.stereotype.Service;

import java.util.regex.Pattern;

@Service
public class AvatarService {

    private static final Pattern DATA_URL = Pattern.compile(
            "^data:image/(png|jpe?g|webp);base64,[A-Za-z0-9+/=]+$");

    public void validate(String dataUrl) {
        if (dataUrl == null || dataUrl.length() > 2_800_000 || !DATA_URL.matcher(dataUrl).matches()) {
            throw new edu.skillswap.ApiException(400, "Invalid request data");
        }
    }
}
