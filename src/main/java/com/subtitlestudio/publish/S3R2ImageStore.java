package com.subtitlestudio.publish;

import com.subtitlestudio.config.SubtitleStudioProperties;
import java.net.URI;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import org.springframework.stereotype.Component;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.core.checksums.RequestChecksumCalculation;
import software.amazon.awssdk.core.checksums.ResponseChecksumValidation;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.Delete;
import software.amazon.awssdk.services.s3.model.DeleteObjectsRequest;
import software.amazon.awssdk.services.s3.model.ListObjectsV2Request;
import software.amazon.awssdk.services.s3.model.ObjectIdentifier;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import software.amazon.awssdk.services.s3.model.S3Object;

/**
 * {@link R2ImageStore} on Cloudflare R2 through its S3 API. The client is built on first use, and only when R2 is on.
 * Not unit-tested: it is checked against the real bucket after deploy. Never log the access keys.
 */
@Component
public class S3R2ImageStore implements R2ImageStore {

    private static final int DELETE_BATCH = 1000;

    private final SubtitleStudioProperties.Publish settings;
    private S3Client client;

    public S3R2ImageStore(SubtitleStudioProperties properties) {
        this.settings = properties.publish();
    }

    private synchronized S3Client client() {
        if (!settings.r2Enabled()) {
            throw new IllegalStateException("R2 is not configured");
        }
        if (client == null) {
            client = S3Client.builder()
                    .region(Region.of("auto"))
                    .endpointOverride(URI.create("https://" + settings.cloudflareAccountId().trim() + ".r2.cloudflarestorage.com"))
                    .credentialsProvider(StaticCredentialsProvider.create(
                            AwsBasicCredentials.create(settings.r2AccessKeyId().trim(), settings.r2SecretAccessKey().trim())))
                    .forcePathStyle(true)
                    // SDK 2.30+ sends checksums by default; R2 does not support all of them.
                    .requestChecksumCalculation(RequestChecksumCalculation.WHEN_REQUIRED)
                    .responseChecksumValidation(ResponseChecksumValidation.WHEN_REQUIRED)
                    .build();
        }
        return client;
    }

    private String bucket() {
        return settings.r2Bucket().trim();
    }

    @Override
    public Set<String> listKeys(String prefix) {
        Set<String> keys = new LinkedHashSet<>();
        client().listObjectsV2Paginator(ListObjectsV2Request.builder().bucket(bucket()).prefix(prefix).build())
                .contents().forEach((S3Object o) -> keys.add(o.key()));
        return keys;
    }

    @Override
    public void put(String key, Path file, String contentType) {
        client().putObject(PutObjectRequest.builder().bucket(bucket()).key(key).contentType(contentType).build(),
                RequestBody.fromFile(file));
    }

    @Override
    public void delete(Collection<String> keys) {
        List<String> all = new ArrayList<>(keys);
        for (int from = 0; from < all.size(); from += DELETE_BATCH) {
            List<ObjectIdentifier> batch = all.subList(from, Math.min(all.size(), from + DELETE_BATCH)).stream()
                    .map(k -> ObjectIdentifier.builder().key(k).build()).toList();
            var response = client().deleteObjects(DeleteObjectsRequest.builder().bucket(bucket())
                    .delete(Delete.builder().objects(batch).quiet(true).build()).build());
            if (response.hasErrors() && !response.errors().isEmpty()) {
                throw new IllegalStateException("R2 refused to delete " + response.errors().size() + " image(s)");
            }
        }
    }
}
