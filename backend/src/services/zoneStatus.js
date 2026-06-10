export function zoneStatusFromCount(count) {
    if (count >= 2501) return { crowd_level: 'crowded',  crowd_label: 'แออัด' };
    if (count >= 1201) return { crowd_level: 'busy',     crowd_label: 'ค่อนข้างแออัด' };
    if (count >= 501)  return { crowd_level: 'moderate', crowd_label: 'ปกติ' };
    return             { crowd_level: 'normal',   crowd_label: 'เบาบาง' };
}
