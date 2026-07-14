import { useState, useEffect } from "react";
import Modal from "../common/Modal";
import Button from "../common/Button";
import { styles, C } from "../../styles/theme";
import PolicySelector from "./PolicySelector";

export default function LifecycleDialog({ open, bucket, current, policies, onSave, onClose, onPoliciesChange }) {
    const [selected, setSelected] = useState("none");

    useEffect(() => {
        if(current?.lifecycle){
            setSelected(
                current.lifecycle.id
            );
        }

    }, [current]);

    return (
        <Modal open={open} onClose={onClose} title="// EDIT LIFECYCLE" width={500}>
            <div style={{marginBottom:"1rem"}}>
                <div style={{color:C.muted}}>
                    Bucket
                </div>
                <div>
                    {bucket?.name}
                </div>
            </div>

            <PolicySelector
                value={selected}
                onChange={setSelected}
                policies={policies}
                onPoliciesChange={onPoliciesChange}
                allowCreate={true}
            />

            <div style={{ display:"flex", justifyContent:"flex-end", gap:12 }}>
                <Button variant="ghost" onClick={onClose}>
                    Cancel
                </Button>

                <Button variant="primary" onClick={() => onSave(selected)}>
                    Save
                </Button>
            </div>
        </Modal>
    );
}