import { useState } from "react";
import Modal from "../common/Modal";
import Button from "../common/Button";
import { styles, C } from "../../styles/theme";

export default function CreateLifecyclePolicyDialog({ open, onClose, onCreate }){
    const [name,setName]=useState("");
    const [unit,setUnit]=useState("days");
    const [value,setValue]=useState(30);
    const [loading,setLoading]=useState(false);
    const [error,setError]=useState("");

    async function submit(){
        if(!name.trim()){
            setError("Policy name is required.");
            return;
        }

        if(value<=0){
            setError("Retention must be greater than zero.");
            return;
        }

        setLoading(true);
        setError("");

        try{
            const payload={
                name:name.trim()
            };

            if(unit==="days"){
                payload.expire_days=value;
            }
            else{
                payload.expire_hours=value;
            }

            await onCreate(payload);
            setName("");
            setValue(30);
            setUnit("days");
            onClose();
        } catch(err){
            setError(err.message);
        } finally{
            setLoading(false);
        }
    }

    return(
        <Modal open={open} onClose={onClose} title="// CREATE LIFECYCLE POLICY" width={520}>
            <div style={{marginBottom:"1rem"}}>
                <label>Policy Name</label>
                <input style={styles.formInput} value={name} onChange={e=>setName(e.target.value)} />
            </div>

            <div style={{display:"flex",gap:"1rem"}}>
                <div style={{flex:1}}>
                    <label>Retention</label>
                    <input style={styles.formInput} type="number" value={value} onChange={e=>setValue(Number(e.target.value))} />
                </div>

                <div style={{width:140}}>
                    <label>Unit</label>
                    <select style={styles.formInput} value={unit} onChange={e=>setUnit(e.target.value)}>
                        <option value="days">
                            Days
                        </option>
                        <option value="hours">
                            Hours
                        </option>
                    </select>
                </div>
            </div>

            <div style={{ marginTop:"1rem", color:C.muted, fontSize:".8rem" }}>
                Objects older than{" "}
                <strong>
                    {value} {unit}
                </strong>
                {" "}will be deleted automatically.
            </div>
            {error && (
                <div style={{ marginTop:"1rem", color:C.red }}>
                    {error}
                </div>
            )}

            <div
                style={{
                    marginTop:"1rem",
                    color:C.red
                }}
            >
                {error}
            </div>
            <div style={{ display:"flex", justifyContent:"flex-end", gap:12, marginTop:"2rem" }}>
                <Button variant="ghost" onClick={onClose}>
                    Cancel
                </Button>
                <Button variant="primary" onClick={submit} disabled={loading}>
                    {loading ? "Creating..." : "Create Policy"}
                </Button>
            </div>
        </Modal>
    );
}