const API_BASE = `${import.meta.env.VITE_API_URL || "http://localhost:5000/api"}/replication`;

export const ReplicationAPI = {
    async getStatus() {
        const response = await fetch(
            `${API_BASE}/status`
        );

        const data =
            await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(
                data.error ||
                "Failed to fetch replication status"
            );
        }

        return data;
    },

    async getBuckets() {
        const response = await fetch(
            `${API_BASE}/buckets`
        );

        const data =
            await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(
                data.error ||
                "Failed to fetch replicated buckets"
            );
        }

        return data;
    },
    
    async configure({
        secondary_zone,
        secondary_endpoint,
        read_only = false,
    }) {
        const response = await fetch(
            `${API_BASE}/configure`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    secondary_zone,
                    secondary_endpoint,
                    read_only,
                }),
            }
        );

        const data =
            await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(
                data.error ||
                "Failed to configure replication"
            );
        }

        return data;
    },

    async provision({
        secondary_host,
        secondary_user,
        secondary_zone,
        secondary_endpoint,
        secondary_port = 7480,
        read_only = false,
    }) {
        const response = await fetch(
            `${API_BASE}/provision`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    secondary_host,
                    secondary_user,
                    secondary_zone,
                    secondary_endpoint,
                    secondary_port,
                    read_only,
                }),
            }
        );

        const data =
            await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(
                data.error ||
                "Failed to provision replication"
            );
        }

        return data;
    },
};

