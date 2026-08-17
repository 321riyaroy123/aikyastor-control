const API_BASE = "/api/replication";

export const ReplicationAPI = {
    async getStatus() {
        const response = await fetch(
            `${API_BASE}/status`
        );

        if (!response.ok) {
            const error =
                await response.json().catch(() => ({}));

            throw new Error(
                error.error ||
                "Failed to fetch replication status"
            );
        }

        return response.json();
    },

    async getBuckets() {
        const response = await fetch(
            `${API_BASE}/buckets`
        );

        if (!response.ok) {
            const error =
                await response.json().catch(() => ({}));

            throw new Error(
                error.error ||
                "Failed to fetch replicated buckets"
            );
        }

        return response.json();
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

