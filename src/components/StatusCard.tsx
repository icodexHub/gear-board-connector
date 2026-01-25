export default function StatusCard() {
  return (
    <div style={card}>
      <p>🟢 Device Status: Connected</p>
      <p>⏱ Connected Since: 10:30 AM</p>
    </div>
  );
}

const card = {
  border: "1px solid #ccc",
  padding: 12,
  marginBottom: 10,
};
