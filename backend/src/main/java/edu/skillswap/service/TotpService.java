package edu.skillswap.service;

import com.google.zxing.BarcodeFormat;
import com.google.zxing.EncodeHintType;
import com.google.zxing.WriterException;
import com.google.zxing.client.j2se.MatrixToImageConfig;
import com.google.zxing.client.j2se.MatrixToImageWriter;
import com.google.zxing.common.BitMatrix;
import com.google.zxing.qrcode.QRCodeWriter;
import edu.skillswap.config.AppProperties;
import org.springframework.stereotype.Service;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.io.ByteArrayOutputStream;
import java.net.URLEncoder;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.InvalidKeyException;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.HashMap;
import java.util.Map;

@Service
public class TotpService {

    private static final String BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    private static final SecureRandom RANDOM = new SecureRandom();

    private final AppProperties props;

    public TotpService(AppProperties props) {
        this.props = props;
    }

    public String generateSecret() {
        byte[] bytes = new byte[20];
        RANDOM.nextBytes(bytes);
        return base32Encode(bytes);
    }

    public String otpauthUri(String secret, String email) {
        String label = "SkillSwap:" + (email == null ? "" : email);
        return "otpauth://totp/" + url(label)
                + "?secret=" + url(secret)
                + "&issuer=" + url("SkillSwap");
    }

    public String qrDataUrl(String uri) {
        try {
            Map<EncodeHintType, Object> hints = new HashMap<>();
            hints.put(EncodeHintType.MARGIN, 1);
            hints.put(EncodeHintType.CHARACTER_SET, "UTF-8");
            BitMatrix matrix = new QRCodeWriter().encode(uri, BarcodeFormat.QR_CODE, 200, 200, hints);
            MatrixToImageConfig config = new MatrixToImageConfig(0xFFF8FAFC, 0xFF1E293B);
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            MatrixToImageWriter.writeToStream(matrix, "PNG", out, config);
            return "data:image/png;base64," + Base64.getEncoder().encodeToString(out.toByteArray());
        } catch (WriterException | java.io.IOException e) {
            throw new IllegalStateException("QR generation failed", e);
        }
    }

    public boolean verify(String secret, String token) {
        if (secret == null || token == null || !token.matches("\\d{6}")) {
            return false;
        }
        byte[] key = base32Decode(secret);
        if (key.length == 0) {
            return false;
        }
        long counter = System.currentTimeMillis() / 30_000L;
        for (long delta = -1; delta <= 1; delta++) {
            if (code(key, counter + delta).equals(token)) {
                return true;
            }
        }
        return false;
    }

    public String recoveryHash(String code) {
        return DbSupport.sha256(props.getAppSecret() + ":recovery:" + code);
    }

    public String codeHash(String purpose, String code) {
        return DbSupport.sha256(props.getAppSecret() + ":" + purpose + ":" + code);
    }

    private static String code(byte[] key, long counter) {
        byte[] message = ByteBuffer.allocate(8).putLong(counter).array();
        try {
            Mac mac = Mac.getInstance("HmacSHA1");
            mac.init(new SecretKeySpec(key, "HmacSHA1"));
            byte[] digest = mac.doFinal(message);
            int offset = digest[digest.length - 1] & 0x0f;
            int binary = ((digest[offset] & 0x7f) << 24)
                    | ((digest[offset + 1] & 0xff) << 16)
                    | ((digest[offset + 2] & 0xff) << 8)
                    | (digest[offset + 3] & 0xff);
            int value = binary % 1_000_000;
            return String.format("%06d", value);
        } catch (NoSuchAlgorithmException | InvalidKeyException e) {
            throw new IllegalStateException("HMAC-SHA1 unavailable", e);
        }
    }

    private static String base32Encode(byte[] input) {
        StringBuilder out = new StringBuilder();
        int buffer = 0;
        int bits = 0;
        for (byte b : input) {
            buffer = (buffer << 8) | (b & 0xff);
            bits += 8;
            while (bits >= 5) {
                out.append(BASE32.charAt((buffer >>> (bits - 5)) & 31));
                bits -= 5;
            }
        }
        if (bits > 0) {
            out.append(BASE32.charAt((buffer << (5 - bits)) & 31));
        }
        return out.toString();
    }

    private static byte[] base32Decode(String input) {
        if (input == null) {
            return new byte[0];
        }
        String clean = input.trim().toUpperCase().replace("=", "");
        int buffer = 0;
        int bits = 0;
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        for (int i = 0; i < clean.length(); i++) {
            int index = BASE32.indexOf(clean.charAt(i));
            if (index < 0) {
                continue;
            }
            buffer = (buffer << 5) | index;
            bits += 5;
            if (bits >= 8) {
                out.write((buffer >>> (bits - 8)) & 0xff);
                bits -= 8;
            }
        }
        return out.toByteArray();
    }

    private static String url(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8).replace("+", "%20");
    }
}
