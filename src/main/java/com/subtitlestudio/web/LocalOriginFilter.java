package com.subtitlestudio.web;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.Set;
import java.util.regex.Pattern;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Guards {@code /api/*} on a no-login, local-only app.
 *
 * <ul>
 *   <li>The {@code Host} header must be {@code localhost} or {@code 127.0.0.1} (any port): blocks DNS rebinding.
 *   <li>A state-changing request that carries an {@code Origin} header must come from {@code http://localhost} or
 *       {@code http://127.0.0.1} (any port, so the Vite dev server works): blocks cross-site request forgery.
 *       The literal {@code null} origin (sandboxed iframe, {@code file://}) is rejected. No {@code Origin} at all
 *       (curl, tests, the Docker healthcheck) is allowed.
 * </ul>
 */
public class LocalOriginFilter extends OncePerRequestFilter {

    static final String CODE = "FORBIDDEN_ORIGIN";
    private static final Set<String> LOCAL_HOSTS = Set.of("localhost", "127.0.0.1");
    private static final Set<String> SAFE_METHODS = Set.of("GET", "HEAD", "OPTIONS");
    private static final Pattern LOCAL_ORIGIN = Pattern.compile("^http://(localhost|127\\.0\\.0\\.1)(:\\d+)?$");

    private final ObjectMapper mapper;

    public LocalOriginFilter(ObjectMapper mapper) {
        this.mapper = mapper;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        if (!localHost(request) || !originAllowed(request)) {
            reject(response);
            return;
        }
        chain.doFilter(request, response);
    }

    private static boolean localHost(HttpServletRequest request) {
        String host = request.getHeader("Host");
        if (host == null) {
            host = request.getServerName();
        }
        if (host == null) {
            return false;
        }
        return LOCAL_HOSTS.contains(stripPort(host));
    }

    private static String stripPort(String host) {
        if (host.startsWith("[")) { // IPv6 literal: not an allowed host
            return host;
        }
        int colon = host.lastIndexOf(':');
        return colon >= 0 ? host.substring(0, colon) : host;
    }

    private static boolean originAllowed(HttpServletRequest request) {
        if (SAFE_METHODS.contains(request.getMethod())) {
            return true;
        }
        String origin = request.getHeader("Origin");
        return origin == null || LOCAL_ORIGIN.matcher(origin).matches();
    }

    private void reject(HttpServletResponse response) throws IOException {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.FORBIDDEN,
                "Request from another site was blocked.");
        problem.setTitle("Forbidden");
        problem.setProperty("code", CODE);
        response.setStatus(HttpStatus.FORBIDDEN.value());
        response.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
        mapper.writeValue(response.getOutputStream(), problem);
    }

    @Configuration
    static class Registration {
        @Bean
        FilterRegistrationBean<LocalOriginFilter> localOriginFilterRegistration(ObjectMapper mapper) {
            FilterRegistrationBean<LocalOriginFilter> bean = new FilterRegistrationBean<>(new LocalOriginFilter(mapper));
            bean.addUrlPatterns("/api/*");
            bean.setOrder(Integer.MIN_VALUE + 10);
            return bean;
        }
    }
}
