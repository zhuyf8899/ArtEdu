CREATE TABLE comfy_feature_settings (
 id boolean PRIMARY KEY DEFAULT true CHECK(id),
 enabled boolean NOT NULL DEFAULT true,
 updated_by text REFERENCES users(id),
 updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO comfy_feature_settings(id,enabled) VALUES(true,true);
