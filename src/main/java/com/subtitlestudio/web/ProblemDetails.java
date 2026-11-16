package com.subtitlestudio.web;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;

/** Builds the RFC 9457 body every error advice returns: status, detail and a machine-readable {@code code}. */
final class ProblemDetails {

    private ProblemDetails() {
    }

    static ProblemDetail problem(HttpStatus status, String code, String detail) {
        ProblemDetail pd = ProblemDetail.forStatusAndDetail(status, detail);
        pd.setProperty("code", code);
        return pd;
    }
}
