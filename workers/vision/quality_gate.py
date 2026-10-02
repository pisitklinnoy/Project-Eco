"""
Quality Gate for Camera Vision Results
คัดกรองความถูกต้องและคุณภาพของภาพและผลตรวจวัดก่อนนำไปพยากรณ์
"""

class QualityGate:
    MIN_CONFIDENCE_THRESHOLD = 0.80
    MIN_IMAGE_SIZE_BYTES = 5000

    # ช่วงระดับน้ำที่เป็นไปได้ตามสเปกเสาวัดน้ำแต่ละสถานี (m R.T.K.)
    STATION_SANITY_BOUNDS = {
        "STN-MUANGKONG": (9.0, 19.0),
        "X.173A": (9.0, 19.0),
        "STN-BANGSALA": (1.5, 13.0),
        "X.90": (1.5, 13.0),
        "STN-HATYAINAI": (0.3, 10.0),
        "X.44": (0.3, 10.0),
    }

    @classmethod
    def evaluate(cls, image_bytes: bytes, detection_result: dict, station_code: str = "STN-BANGSALA") -> dict:
        """
        ประเมินผลการตรวจวัด:
        returns:
        - status: "PASSED" | "FLAGGED_FOR_REVIEW" | "REJECTED"
        - reason: คำอธิบาย
        """
        if len(image_bytes) < cls.MIN_IMAGE_SIZE_BYTES:
            return {
                "status": "REJECTED",
                "reason": "IMAGE_CORRUPTED_OR_EMPTY"
            }

        conf = detection_result.get("confidence", 0.0)
        if conf < cls.MIN_CONFIDENCE_THRESHOLD:
            return {
                "status": "FLAGGED_FOR_REVIEW",
                "reason": f"LOW_CONFIDENCE_{conf:.2f}_BELOW_{cls.MIN_CONFIDENCE_THRESHOLD}"
            }

        # ตรวจสอบค่ากระโดดผิดปกติ (Sanity Check) ตามสถานี
        water_level = detection_result.get("water_level", 0.0)
        min_bound, max_bound = cls.STATION_SANITY_BOUNDS.get(str(station_code).upper(), (0.0, 22.0))

        if water_level < min_bound or water_level > max_bound:
            return {
                "status": "FLAGGED_FOR_REVIEW",
                "reason": f"OUT_OF_BOUNDS_LEVEL_{water_level}M_EXPECTED_{min_bound}-{max_bound}M"
            }

        return {
            "status": "PASSED",
            "reason": "CONFIDENCE_HIGH_PASSED_SANITY"
        }
