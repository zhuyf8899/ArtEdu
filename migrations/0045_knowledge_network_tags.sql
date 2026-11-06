ALTER TABLE knowledge_nodes ADD COLUMN tags jsonb NOT NULL DEFAULT '[]'::jsonb
 CHECK(jsonb_typeof(tags)='array' AND jsonb_array_length(tags)<=12);
ALTER TABLE knowledge_nodes ADD COLUMN show_in_network boolean NOT NULL DEFAULT false;
