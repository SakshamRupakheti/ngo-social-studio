-- One bounded counter per active identity and operation, reused across windows.
CREATE TABLE request_limits (email TEXT NOT NULL REFERENCES members(email), operation TEXT NOT NULL, window INTEGER NOT NULL, used INTEGER NOT NULL, PRIMARY KEY(email,operation));
